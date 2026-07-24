import { spawn } from "node:child_process";

import { MODEL } from "./contracts-v1.mjs";

export class AgyError extends Error {
  constructor(kind, message, details = {}) {
    super(message);
    this.name = "AgyError";
    this.kind = kind;
    this.details = details;
  }
}

export function captureProcess(command, args, options = {}) {
  const {
    cwd = process.cwd(),
    timeoutMs = 300_000,
    maxOutputCharacters = 200_000,
    env = process.env
  } = options;
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill();
      settled = true;
      reject(
        new AgyError("timeout", `agy exceeded the ${timeoutMs} ms wrapper timeout`, {
          timeoutMs
        })
      );
    }, timeoutMs);
    const append = (current, chunk, stream) => {
      const next = current + chunk.toString("utf8");
      if (next.length > maxOutputCharacters) {
        child.kill();
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(
            new AgyError(
              "output-limit",
              `${stream} exceeded ${maxOutputCharacters} characters`
            )
          );
        }
      }
      return next;
    };
    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk, "stdout");
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk, "stderr");
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const kind = error.code === "ENOENT" ? "missing-executable" : "spawn";
      reject(new AgyError(kind, `could not start agy: ${error.message}`));
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? -1, signal, stdout, stderr });
    });
  });
}

export async function assertAgyReady(options = {}) {
  const executable = options.executable ?? "agy";
  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? 30_000;
  const capture = options.capture ?? captureProcess;
  const version = await capture(executable, ["--version"], { cwd, timeoutMs });
  if (version.code !== 0) {
    throw new AgyError("unavailable", "agy --version failed", {
      exitCode: version.code,
      stderr: version.stderr.trim().slice(0, 500)
    });
  }
  const models = await capture(executable, ["models"], { cwd, timeoutMs });
  if (models.code !== 0) {
    throw new AgyError("model-list", "agy models failed", {
      exitCode: models.code,
      stderr: models.stderr.trim().slice(0, 500)
    });
  }
  const available = models.stdout
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!available.includes(MODEL)) {
    throw new AgyError("missing-model", `agy does not list required model ${MODEL}`, {
      available
    });
  }
  return { version: version.stdout.trim(), model: MODEL };
}

export async function runAgyPrompt(prompt, options = {}) {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new AgyError("invalid-prompt", "prompt must be non-empty");
  }
  const maxPromptCharacters = options.maxPromptCharacters ?? 28_000;
  if (prompt.length > maxPromptCharacters) {
    throw new AgyError(
      "prompt-limit",
      `prompt has ${prompt.length} characters; Windows-safe limit is ${maxPromptCharacters}`
    );
  }
  const executable = options.executable ?? "agy";
  const timeoutMs = options.timeoutMs ?? 300_000;
  const cliTimeoutSeconds = Math.max(1, Math.floor((timeoutMs - 2_000) / 1_000));
  const additionalDirectories = options.additionalDirectories ?? [];
  if (
    !Array.isArray(additionalDirectories) ||
    additionalDirectories.some(
      (directory) => typeof directory !== "string" || directory.trim().length === 0
    )
  ) {
    throw new AgyError("invalid-directories", "additionalDirectories must contain paths");
  }
  const args = [
    "--sandbox",
    "--mode",
    "plan",
    "--effort",
    "high",
    "--model",
    MODEL,
    "--print-timeout",
    `${cliTimeoutSeconds}s`
  ];
  for (const directory of additionalDirectories) {
    args.push("--add-dir", directory);
  }
  args.push(
    "--print",
    prompt
  );
  const capture = options.capture ?? captureProcess;
  const result = await capture(executable, args, {
    cwd: options.cwd ?? process.cwd(),
    timeoutMs,
    maxOutputCharacters: options.maxOutputCharacters ?? 200_000
  });
  if (result.code !== 0) {
    throw new AgyError("nonzero-exit", `agy exited with code ${result.code}`, {
      exitCode: result.code,
      signal: result.signal,
      stderr: result.stderr.trim().slice(0, 2_000)
    });
  }
  const output = result.stdout.trim();
  if (output.length === 0) {
    throw new AgyError("empty-output", "agy returned an empty stdout response", {
      stderr: result.stderr.trim().slice(0, 2_000)
    });
  }
  return output;
}
