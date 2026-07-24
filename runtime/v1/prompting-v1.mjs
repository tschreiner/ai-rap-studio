import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const PROMPT_ROOT = new URL("../../assets/prompts/v1/", import.meta.url);
const MANIFEST_URL = new URL("manifest.v5.json", PROMPT_ROOT);

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function safeJson(value, space = 2) {
  return JSON.stringify(value, null, space)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

export function renderTemplate(template, replacements) {
  let rendered = template;
  for (const [name, value] of Object.entries(replacements)) {
    const token = `{{${name}}}`;
    const count = rendered.split(token).length - 1;
    if (count !== 1) {
      throw new Error(`template token ${token} must occur exactly once, found ${count}`);
    }
    rendered = rendered.replace(token, value);
  }
  const unresolved = rendered.match(/\{\{[^}]+\}\}/gu);
  if (unresolved) throw new Error(`unresolved template token ${unresolved[0]}`);
  return rendered;
}

export function composePrompt(system, user) {
  return [
    "<system_instruction>",
    system.trim(),
    "</system_instruction>",
    "",
    "<user_request>",
    user.trim(),
    "</user_request>"
  ].join("\n");
}

export async function loadPrompt(name, options = {}) {
  const manifest = JSON.parse(await readFile(MANIFEST_URL, "utf8"));
  const expected = manifest.files?.[name];
  if (typeof expected !== "string") throw new Error(`prompt ${name} is not in manifest.v1.json`);
  const value = await readFile(new URL(name, PROMPT_ROOT), "utf8");
  if (options.verifyIntegrity !== false && sha256(value) !== expected) {
    throw new Error(`integrity check failed for prompt ${name}`);
  }
  return value;
}

export function extractJson(response, envelopeName) {
  let candidate = response.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(candidate);
  if (fence) candidate = fence[1].trim();
  if (envelopeName) {
    const escaped = envelopeName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const envelope = new RegExp(
      `^<${escaped}>\\s*([\\s\\S]*?)\\s*</${escaped}>$`,
      "iu"
    ).exec(candidate);
    if (!envelope) throw new Error(`expected exactly one <${envelopeName}> envelope`);
    candidate = envelope[1].trim();
  }
  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new Error(`invalid JSON response: ${error.message}`, { cause: error });
  }
}
