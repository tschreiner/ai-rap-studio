#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { assertAgyReady } from "../runtime/v1/agy-client-v1.mjs";
import {
  DEFAULT_SECTION_CONTRACT,
  MODEL,
  evaluateLyricsOutput,
  parseLyricsOutput,
  validateArtifact,
  validateSectionContract,
  validateStructuredBriefing
} from "../runtime/v1/contracts-v1.mjs";
import {
  createRunDirectory,
  defaultBriefingInput,
  generateBriefing,
  generateIdeas,
  generateLyrics,
  generateSongFilm,
  readJson,
  runPipeline,
  writeJson
} from "../runtime/v1/pipeline-v1.mjs";
import { sha256 } from "../runtime/v1/prompting-v1.mjs";

class CliError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function usage() {
  return `AI Rap Studio v1

Usage:
  node scripts/ai-rap-studio-v1.mjs doctor [--agy PATH]
  node scripts/ai-rap-studio-v1.mjs ideas --mode random|source [options]
  node scripts/ai-rap-studio-v1.mjs briefing --idea FILE [options]
  node scripts/ai-rap-studio-v1.mjs songfilm --briefing FILE [options]
  node scripts/ai-rap-studio-v1.mjs lyrics --briefing FILE --songfilm FILE [options]
  node scripts/ai-rap-studio-v1.mjs run --mode random|source [options]
  node scripts/ai-rap-studio-v1.mjs validate --type TYPE --input FILE [context]

Common inference options:
  --agy PATH                 Override agy executable (default: agy)
  --timeout-seconds N        Wrapper timeout per inference (default: 300)
  --output-dir DIR           Output root (default: outputs)

Idea input:
  --mode random|source
  --language CODE            Default: de
  --count N                  Default: 3
  --seed TEXT                Stabilizes the local creative palette
  --direction TEXT
  --source-file FILE         Preferred private-source input
  --source-text TEXT         Supported, but visible in process arguments

Stage context:
  --section-contract FILE    Optional contract JSON; default is the RoastGPT structure
  --idea-index N             Zero-based candidate index for run (default: 0)
`;
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) throw new CliError(`unexpected argument ${token}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      options[token.slice(2)] = true;
    } else {
      options[token.slice(2)] = value;
      index += 1;
    }
  }
  return options;
}

function positiveInteger(value, name, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) throw new CliError(`${name} must be positive`);
  return parsed;
}

function zeroBasedInteger(value, name, fallback = 0) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 0) throw new CliError(`${name} must be zero or greater`);
  return parsed;
}

function required(options, name) {
  const value = options[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new CliError(`--${name} is required`);
  }
  return value;
}

async function loadArtifact(path, expectedKind) {
  const value = await readJson(path);
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.kind === "string" &&
    Object.hasOwn(value, "data")
  ) {
    if (expectedKind && value.kind !== expectedKind) {
      throw new CliError(`expected ${expectedKind} artifact, received ${value.kind}`);
    }
    return value.data;
  }
  return value;
}

async function sectionContract(options, songfilmArtifact) {
  if (typeof options["section-contract"] === "string") {
    return validateSectionContract(await readJson(options["section-contract"]));
  }
  if (songfilmArtifact?.sectionContract) {
    return validateSectionContract(songfilmArtifact.sectionContract);
  }
  return DEFAULT_SECTION_CONTRACT;
}

async function buildIdeaInput(options) {
  const mode = required(options, "mode");
  const input = {
    mode,
    language: options.language ?? "de",
    count: positiveInteger(options.count, "--count", 3)
  };
  if (typeof options.seed === "string") input.seed = options.seed;
  if (typeof options.direction === "string") input.creativeDirection = options.direction;
  if (mode === "source") {
    if (options["source-file"] && options["source-text"]) {
      throw new CliError("use either --source-file or --source-text, not both");
    }
    if (typeof options["source-file"] === "string") {
      const sourcePath = resolve(options["source-file"]);
      const content = await readFile(sourcePath, "utf8");
      const isolatedDirectory = await mkdtemp(join(tmpdir(), "ai-rap-studio-source-"));
      const isolatedPath = join(isolatedDirectory, "source.txt");
      await writeFile(isolatedPath, content, "utf8");
      input.source = {
        label: basename(sourcePath),
        fileReference: isolatedPath,
        contentSha256: sha256(content),
        contentCharacters: content.length
      };
      input.cleanupDirectory = isolatedDirectory;
    } else if (typeof options["source-text"] === "string") {
      input.source = { label: "inline-source", content: options["source-text"] };
    } else {
      throw new CliError("source mode requires --source-file or --source-text");
    }
    const sourceCharacters = input.source.content?.length ?? input.source.contentCharacters;
    if (sourceCharacters > 12_000) {
      throw new CliError("source input exceeds the Windows-safe 12,000 character limit");
    }
  }
  const cleanupDirectory = input.cleanupDirectory;
  delete input.cleanupDirectory;
  return { input, cleanupDirectory };
}

function inferenceOptions(options) {
  return {
    agyExecutable: options.agy ?? "agy",
    cwd: process.cwd(),
    timeoutMs: positiveInteger(
      options["timeout-seconds"],
      "--timeout-seconds",
      300
    ) * 1_000
  };
}

async function writeStageArtifact(options, fileName, value, markdown) {
  const runDirectory = await createRunDirectory(options["output-dir"] ?? "outputs");
  await writeJson(resolve(runDirectory, fileName), value);
  if (markdown) await writeFile(resolve(runDirectory, markdown.name), `${markdown.value}\n`, "utf8");
  return runDirectory;
}

async function commandDoctor(options) {
  const result = await assertAgyReady(inferenceOptions(options));
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

async function commandIdeas(options) {
  const prepared = await buildIdeaInput(options);
  try {
    const artifact = await generateIdeas(prepared.input, inferenceOptions(options));
    const directory = await writeStageArtifact(options, "02-song-ideas.json", artifact);
    console.log(directory);
  } finally {
    if (prepared.cleanupDirectory) {
      await rm(prepared.cleanupDirectory, { recursive: true, force: true });
    }
  }
}

async function commandBriefing(options) {
  const ideas = await loadArtifact(required(options, "idea"), "song-ideas");
  const index = zeroBasedInteger(options["idea-index"], "--idea-index");
  const idea = ideas.ideas?.[index];
  if (!idea) throw new CliError(`idea index ${index} does not exist`);
  const artifact = await generateBriefing(
    defaultBriefingInput(idea, options.language ?? "de"),
    inferenceOptions(options)
  );
  const directory = await writeStageArtifact(options, "03-structured-briefing.json", artifact);
  console.log(directory);
}

async function commandSongFilm(options) {
  const briefing = await loadArtifact(required(options, "briefing"), "structured-briefing");
  const contract = await sectionContract(options);
  const artifact = await generateSongFilm(briefing, contract, inferenceOptions(options));
  const directory = await writeStageArtifact(options, "04-songfilm-plan.json", artifact);
  console.log(directory);
}

async function commandLyrics(options) {
  const briefing = await loadArtifact(required(options, "briefing"), "structured-briefing");
  const rawSongfilmArtifact = await readJson(required(options, "songfilm"));
  const songfilm = rawSongfilmArtifact.data ?? rawSongfilmArtifact;
  const contract = await sectionContract(options, rawSongfilmArtifact);
  const artifact = await generateLyrics(
    briefing,
    songfilm,
    contract,
    inferenceOptions(options)
  );
  const directory = await writeStageArtifact(options, "05-lyrics-output.json", artifact, {
    name: "05-lyrics.md",
    value: artifact.data.lyrics
  });
  console.log(directory);
  if (!artifact.evaluation.passed) process.exitCode = 3;
}

async function commandRun(options) {
  const prepared = await buildIdeaInput(options);
  try {
    const result = await runPipeline(prepared.input, {
      ...inferenceOptions(options),
      outputDirectory: options["output-dir"] ?? "outputs",
      ideaIndex: zeroBasedInteger(options["idea-index"], "--idea-index")
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.lyricsPassed) process.exitCode = 3;
  } finally {
    if (prepared.cleanupDirectory) {
      await rm(prepared.cleanupDirectory, { recursive: true, force: true });
    }
  }
}

async function commandValidate(options) {
  const type = required(options, "type");
  const inputPath = required(options, "input");
  if (type === "lyrics") {
    const parsed = parseLyricsOutput(await readFile(resolve(inputPath), "utf8"));
    const briefing = validateStructuredBriefing(
      await loadArtifact(required(options, "briefing"), "structured-briefing")
    );
    let songfilmArtifact;
    if (typeof options.songfilm === "string") {
      songfilmArtifact = await readJson(options.songfilm);
    }
    if (!options["section-contract"] && !songfilmArtifact?.sectionContract) {
      throw new CliError(
        "lyrics validation requires --section-contract or a --songfilm artifact with sectionContract"
      );
    }
    const contract = await sectionContract(options, songfilmArtifact);
    const evaluation = evaluateLyricsOutput(parsed, briefing, contract);
    console.log(
      JSON.stringify(
        {
          ok: evaluation.passed,
          title: parsed.title,
          sections: parsed.sections.length,
          evaluation
        },
        null,
        2
      )
    );
    if (!evaluation.passed) process.exitCode = 3;
    return;
  }
  const value = await loadArtifact(inputPath);
  const context = {};
  if (type === "songfilm") {
    context.briefing = validateStructuredBriefing(
      await loadArtifact(required(options, "briefing"), "structured-briefing")
    );
    context.sectionContract = await sectionContract(options);
  }
  validateArtifact(type, value, context);
  console.log(JSON.stringify({ ok: true, type, input: resolve(inputPath) }));
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    console.log(usage());
    return;
  }
  const options = parseOptions(rest);
  if (command === "doctor") return commandDoctor(options);
  if (command === "ideas") return commandIdeas(options);
  if (command === "briefing") return commandBriefing(options);
  if (command === "songfilm" || command === "soundfilm") return commandSongFilm(options);
  if (command === "lyrics") return commandLyrics(options);
  if (command === "run") return commandRun(options);
  if (command === "validate") return commandValidate(options);
  throw new CliError(`unknown command ${command}\n\n${usage()}`);
}

main().catch((error) => {
  const prefix = error.kind ? `${error.name}[${error.kind}]` : error.name ?? "Error";
  console.error(`${prefix}: ${error.message}`);
  process.exitCode = error.exitCode ?? 1;
});
