#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";

import {
  DEFAULT_SECTION_CONTRACT,
  MODEL,
  validateSectionContract
} from "../runtime/v1/contracts-v1.mjs";
import { loadPrompt } from "../runtime/v1/prompting-v1.mjs";

const ROOT = new URL("../", import.meta.url);
const PROMPT_ROOT = new URL("assets/prompts/v1/", ROOT);

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalized(value) {
  return value.replace(/\r\n/gu, "\n").trimEnd();
}

async function main() {
  if (MODEL !== "gemini-3.1-pro-high") throw new Error(`unexpected model ${MODEL}`);
  validateSectionContract(DEFAULT_SECTION_CONTRACT);
  const manifest = JSON.parse(await readFile(new URL("manifest.v5.json", PROMPT_ROOT), "utf8"));
  const files = (await readdir(PROMPT_ROOT))
    .filter((name) => name.endsWith(".md"))
    .sort();
  const declared = Object.keys(manifest.files).sort();
  if (JSON.stringify(files) !== JSON.stringify(declared)) {
    throw new Error("prompt manifest does not match prompt files");
  }
  await Promise.all(files.map((name) => loadPrompt(name)));
  const bundled = await readFile(new URL("lyrics.system.roastgpt.v1.md", PROMPT_ROOT), "utf8");
  if (hash(normalized(bundled)) !== manifest.sources.roastGptNormalizedSha256) {
    throw new Error("bundled RoastGPT normalized hash changed");
  }
  let sourceHash = "not-available";
  let sourceAvailable = false;
  const sourcePath = process.env.AI_RAP_STUDIO_ROASTGPT_SOURCE;
  if (sourcePath) {
    try {
      await access(sourcePath);
      sourceAvailable = true;
    } catch {
      throw new Error("AI_RAP_STUDIO_ROASTGPT_SOURCE does not reference a readable file");
    }
  }
  if (sourceAvailable && process.env.AI_RAP_STUDIO_SKIP_SOURCE_ATTACHMENT !== "1") {
    const source = await readFile(sourcePath, "utf8");
    sourceHash = hash(source);
    if (normalized(source) !== normalized(bundled)) {
      throw new Error("bundled RoastGPT prompt differs from the normalized attachment source");
    }
    if (sourceHash !== manifest.sources.roastGptAttachmentSha256) {
      throw new Error("RoastGPT attachment source hash changed");
    }
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        model: MODEL,
        prompts: files.length,
        roastGptSourceSha256: sourceHash,
        roastGptNormalizedSha256: hash(normalized(bundled))
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(`Runtime validation failed: ${error.message}`);
  process.exitCode = 1;
});
