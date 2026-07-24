import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AgyError,
  assertAgyReady,
  runAgyPrompt
} from "../runtime/v1/agy-client-v1.mjs";

test("agy prompt uses the required model, sandbox, plan mode, and high effort", async () => {
  let captured;
  const output = await runAgyPrompt("synthetic prompt", {
    executable: "fake-agy",
    timeoutMs: 10_000,
    capture: async (command, args) => {
      captured = { command, args };
      return { code: 0, signal: null, stdout: "synthetic output\n", stderr: "" };
    }
  });
  assert.equal(output, "synthetic output");
  assert.equal(captured.command, "fake-agy");
  assert.ok(captured.args.includes("--sandbox"));
  assert.deepEqual(
    captured.args.slice(captured.args.indexOf("--mode"), captured.args.indexOf("--mode") + 2),
    ["--mode", "plan"]
  );
  assert.deepEqual(
    captured.args.slice(captured.args.indexOf("--model"), captured.args.indexOf("--model") + 2),
    ["--model", "gemini-3.1-pro-high"]
  );
  assert.deepEqual(
    captured.args.slice(captured.args.indexOf("--effort"), captured.args.indexOf("--effort") + 2),
    ["--effort", "high"]
  );
  assert.equal(captured.args.at(-2), "--print");
  assert.equal(captured.args.at(-1), "synthetic prompt");
});

test("agy prompt grants only explicitly requested source directories", async () => {
  let args;
  await runAgyPrompt("read the referenced synthetic file", {
    additionalDirectories: ["C:\\isolated\\source"],
    capture: async (_command, capturedArgs) => {
      args = capturedArgs;
      return { code: 0, signal: null, stdout: "ok", stderr: "" };
    }
  });
  const index = args.indexOf("--add-dir");
  assert.ok(index >= 0);
  assert.equal(args[index + 1], "C:\\isolated\\source");
  assert.equal(args.includes("--dangerously-skip-permissions"), false);
});

test("agy prompt distinguishes empty output and nonzero exit", async () => {
  await assert.rejects(
    runAgyPrompt("test", {
      capture: async () => ({ code: 0, signal: null, stdout: "", stderr: "" })
    }),
    (error) => error instanceof AgyError && error.kind === "empty-output"
  );
  await assert.rejects(
    runAgyPrompt("test", {
      capture: async () => ({ code: 7, signal: null, stdout: "", stderr: "safe error" })
    }),
    (error) => error instanceof AgyError && error.kind === "nonzero-exit"
  );
});

test("doctor rejects a missing required model", async () => {
  let call = 0;
  await assert.rejects(
    assertAgyReady({
      capture: async () => {
        call += 1;
        return call === 1
          ? { code: 0, stdout: "agy 1.1.6", stderr: "" }
          : { code: 0, stdout: "another-model\n", stderr: "" };
      }
    }),
    (error) => error instanceof AgyError && error.kind === "missing-model"
  );
});
