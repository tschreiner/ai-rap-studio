import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  DEFAULT_SECTION_CONTRACT,
  MODEL,
  SCHEMA_VERSION,
  evaluateLyricsOutput,
  parseLyricsOutput,
  validateIdeaInput,
  validateSectionContract,
  validateSongFilmPlan,
  validateSongIdeas,
  validateStructuredBriefing
} from "./contracts-v1.mjs";
import { runAgyPrompt } from "./agy-client-v1.mjs";
import {
  composePrompt,
  extractJson,
  loadPrompt,
  renderTemplate,
  safeJson,
  sha256
} from "./prompting-v1.mjs";

const PALETTES = Object.freeze({
  settings: ["midnight laundromat", "empty football clubhouse", "late-shift kiosk", "rainy tram terminus"],
  tensions: ["status versus competence", "loyalty versus self-respect", "swagger versus evidence", "nostalgia versus change"],
  energies: ["bouncy boom-bap", "funky west-coast bounce", "jazzy sample rap", "fast electro rap"],
  devices: ["misdirection punchlines", "escalating callbacks", "scene-based irony", "perspective reversal"]
});

function seededIndex(seed, namespace, length) {
  const digest = createHash("sha256").update(`${seed}:${namespace}`).digest();
  return digest.readUInt32BE(0) % length;
}

export function creativePalette(seed = randomUUID()) {
  return Object.fromEntries(
    Object.entries(PALETTES).map(([name, values]) => [
      name,
      values[seededIndex(seed, name, values.length)]
    ])
  );
}

function inputHash(value) {
  return sha256(safeJson(value, 0));
}

function metadata(kind, input) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind,
    createdAt: new Date().toISOString(),
    model: MODEL,
    inputHash: inputHash(input)
  };
}

async function infer(systemName, userName, replacements, options) {
  const [system, userTemplate] = await Promise.all([
    loadPrompt(systemName),
    loadPrompt(userName)
  ]);
  const user = renderTemplate(userTemplate, replacements);
  const prompt = composePrompt(system, user);
  const runner = options.runner ?? runAgyPrompt;
  return runner(prompt, {
    executable: options.agyExecutable,
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
    additionalDirectories: options.additionalDirectories
  });
}

export async function generateIdeas(input, options = {}) {
  const validatedInput = validateIdeaInput(input);
  const palette = creativePalette(validatedInput.seed ?? randomUUID());
  const sourceDirectory = validatedInput.source?.fileReference
    ? dirname(validatedInput.source.fileReference)
    : undefined;
  const response = await infer(
    "idea.system.v2.md",
    "idea.user.v1.md",
    {
      idea_input_json: safeJson(validatedInput),
      creative_palette_json: safeJson(palette)
    },
    {
      ...options,
      additionalDirectories: sourceDirectory
        ? [sourceDirectory]
        : options.additionalDirectories
    }
  );
  const data = validateSongIdeas(extractJson(response));
  if (data.ideas.length !== validatedInput.count) {
    throw new Error(`model returned ${data.ideas.length} ideas; expected ${validatedInput.count}`);
  }
  return { ...metadata("song-ideas", validatedInput), palette, data };
}

export function defaultBriefingInput(idea, language = "de") {
  return {
    selectedIdea: idea,
    defaults: {
      language,
      perspective: idea.perspective,
      musicalDirection: "Rap subgenre other than drill or industrial; fixed BPM",
      vocalDesign: "Performance-readable rap delivery with selective adlibs",
      tone: idea.tone,
      flowAndRhyme: "Multisyllabic end rhymes, internal rhymes, natural syntax",
      hookGoal: idea.hookPromise
    },
    hardContract: {
      immutableFacts: [
        "Do not invent identities, relationships, events, or biographical claims.",
        "Attack decisions, habits, skills, status behavior, style, and harmless quirks only."
      ],
      boundaries: "Keep the roast focused on behavior and skill; system safety rules remain binding.",
      avoid: "Word-list lyrics, explanatory hooks, generic boss/king/legend labels, long prose lines, meta text, placeholders, drill, and industrial.",
      structure: DEFAULT_SECTION_CONTRACT,
      verseContract: "Each Verse contains exactly 16 performable lines.",
      hookContract: "Each Chorus contains 4-8 performable lines built around one short core phrase.",
      maxLyricsCharacters: 5000,
      maxTitleWords: 5
    },
    sunoDirectives: []
  };
}

export async function generateBriefing(input, options = {}) {
  const response = await infer(
    "briefing.system.v1.md",
    "briefing.user.v1.md",
    { briefing_input_json: safeJson(input) },
    options
  );
  const data = validateStructuredBriefing(extractJson(response, "song_request"));
  return { ...metadata("structured-briefing", input), data };
}

export async function generateSongFilm(briefing, sectionContract = DEFAULT_SECTION_CONTRACT, options = {}) {
  const validatedBriefing = validateStructuredBriefing(briefing);
  const validatedContract = validateSectionContract(sectionContract);
  const response = await infer(
    "songfilm.system.v1.md",
    "songfilm.user.v1.md",
    {
      song_request_json: safeJson(validatedBriefing),
      section_contract_json: safeJson(validatedContract)
    },
    options
  );
  const data = validateSongFilmPlan(
    extractJson(response),
    validatedContract,
    validatedBriefing
  );
  return {
    ...metadata("songfilm-plan", { briefing: validatedBriefing, sectionContract: validatedContract }),
    sectionContract: validatedContract,
    data
  };
}

export async function generateLyrics(
  briefing,
  songfilm,
  sectionContract = DEFAULT_SECTION_CONTRACT,
  options = {}
) {
  const validatedBriefing = validateStructuredBriefing(briefing);
  const validatedContract = validateSectionContract(sectionContract);
  const validatedPlan = validateSongFilmPlan(songfilm, validatedContract, validatedBriefing);
  const [system, userTemplate] = await Promise.all([
    loadPrompt("lyrics.system.roastgpt.v1.md"),
    loadPrompt("lyrics.user.v4.md")
  ]);
  const user = renderTemplate(userTemplate, {
    song_request_json: safeJson(validatedBriefing),
    songfilm_plan_json: safeJson(validatedPlan),
    section_contract_json: safeJson(validatedContract)
  });
  const runner = options.runner ?? runAgyPrompt;
  const raw = await runner(composePrompt(system, user), {
    executable: options.agyExecutable,
    cwd: options.cwd,
    timeoutMs: options.timeoutMs
  });
  const parsed = parseLyricsOutput(raw);
  const evaluation = evaluateLyricsOutput(parsed, validatedBriefing, validatedContract);
  const data = {
    title: parsed.title,
    styleTags: parsed.styleTags,
    lyrics: parsed.lyrics
  };
  return {
    ...metadata("lyrics-output", {
      briefing: validatedBriefing,
      songfilm: validatedPlan,
      sectionContract: validatedContract
    }),
    data,
    evaluation
  };
}

function sanitizeIdeaInput(input) {
  if (!input.source) return input;
  if (input.source.fileReference) return input;
  return {
    ...input,
    source: {
      label: input.source.label,
      contentHash: sha256(input.source.content),
      contentCharacters: input.source.content.length
    }
  };
}

export async function createRunDirectory(baseDirectory = "outputs") {
  const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
  const runDirectory = resolve(baseDirectory, `${stamp}-${randomUUID().slice(0, 8)}`);
  await mkdir(runDirectory, { recursive: true });
  return runDirectory;
}

export async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

export async function runPipeline(input, options = {}) {
  const validatedInput = validateIdeaInput(input);
  const runDirectory = options.runDirectory ?? (await createRunDirectory(options.outputDirectory));
  await writeJson(resolve(runDirectory, "01-idea-input.json"), sanitizeIdeaInput(validatedInput));
  const ideas = await generateIdeas(validatedInput, options);
  await writeJson(resolve(runDirectory, "02-song-ideas.json"), ideas);
  const selectedIndex = options.ideaIndex ?? 0;
  const selectedIdea = ideas.data.ideas[selectedIndex];
  if (!selectedIdea) throw new Error(`idea index ${selectedIndex} does not exist`);
  const briefingInput = defaultBriefingInput(selectedIdea, validatedInput.language);
  const briefing = await generateBriefing(briefingInput, options);
  await writeJson(resolve(runDirectory, "03-structured-briefing.json"), briefing);
  const songfilm = await generateSongFilm(briefing.data, DEFAULT_SECTION_CONTRACT, options);
  await writeJson(resolve(runDirectory, "04-songfilm-plan.json"), songfilm);
  const lyrics = await generateLyrics(
    briefing.data,
    songfilm.data,
    songfilm.sectionContract,
    options
  );
  await writeJson(resolve(runDirectory, "05-lyrics-output.json"), lyrics);
  await writeFile(resolve(runDirectory, "05-lyrics.md"), `${lyrics.data.lyrics}\n`, "utf8");
  const summary = {
    runDirectory,
    model: MODEL,
    selectedIdeaId: selectedIdea.id,
    lyricsPassed: lyrics.evaluation.passed,
    checks: lyrics.evaluation.checks
  };
  await writeJson(resolve(runDirectory, "run-summary.json"), summary);
  return summary;
}
