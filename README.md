# AI Rap Studio

AI Rap Studio is a local Codex plugin and command-line workflow for creating rap songs in explicit, resumable stages:

```text
IdeaInput → SongIdea[] → StructuredBriefing → SongFilmPlan → LyricsOutput
```

Every creative inference is routed through the locally installed `agy` CLI with exactly `gemini-3.1-pro-high`. The runtime has no fallback model and rejects invalid intermediate artifacts before the next creative stage.

## Why the workflow is staged

Repository-backed evaluations found `v2-schema` to be the most stable measured single-step basis, with a mean contract score of 9.33/10 across six runs. The best current production direction separates planning from rendering:

1. compile a structured briefing;
2. plan a Songfilm;
3. validate the plan;
4. render concise lyrics;
5. evaluate the result deterministically.

This is an architecture decision, not proof of universally better creative quality. Contract checks do not reliably measure flow, rhyme quality, originality, or musical effect.

## Requirements

- Windows with PowerShell
- Node.js 22 or newer
- `agy` 1.1.6 or a compatible newer version
- the `gemini-3.1-pro-high` model visible in `agy models`
- an authenticated provider session for live inference

Check the local integration without generating content:

```powershell
node .\scripts\ai-rap-studio-v1.mjs doctor
```

The command verifies the installed CLI and required model. It does not print credentials.

## Quick start

Generate random candidates:

```powershell
.\scripts\ai-rap-studio-v1.ps1 ideas `
  --mode random `
  --language de `
  --count 3 `
  --seed kiosk-night
```

Generate candidates from a private UTF-8 source file:

```powershell
.\scripts\ai-rap-studio-v1.ps1 ideas `
  --mode source `
  --language de `
  --count 3 `
  --source-file C:\private\story.txt
```

Run the complete pipeline and select the first candidate:

```powershell
.\scripts\ai-rap-studio-v1.ps1 run `
  --mode random `
  --language de `
  --count 3 `
  --idea-index 0 `
  --seed kiosk-night
```

Use `node .\scripts\ai-rap-studio-v1.mjs help` for all commands.

## Resume from an artifact

Each stage can run independently:

```powershell
.\scripts\ai-rap-studio-v1.ps1 briefing `
  --idea .\outputs\<run>\02-song-ideas.json `
  --idea-index 0

.\scripts\ai-rap-studio-v1.ps1 songfilm `
  --briefing .\outputs\<run>\03-structured-briefing.json

.\scripts\ai-rap-studio-v1.ps1 lyrics `
  --briefing .\outputs\<run>\03-structured-briefing.json `
  --songfilm .\outputs\<run>\04-songfilm-plan.json
```

`soundfilm` is accepted as a command alias. Public artifacts and documentation use the canonical terms `Songfilm` and `SongFilmPlan`.

## Output

Every invocation creates a unique directory under `outputs/`. A full run writes:

```text
01-idea-input.json
02-song-ideas.json
03-structured-briefing.json
04-songfilm-plan.json
05-lyrics-output.json
05-lyrics.md
run-summary.json
```

`outputs/` is ignored by Git. In file mode, the CLI copies the source into an isolated temporary directory, places only that temporary file reference, label, character count, and SHA-256 in the prompt, grants the isolated directory to sandboxed `agy` with `--add-dir`, and deletes it after idea generation. The original path and file content do not appear in the child-process prompt; the temporary path does. Inline `--source-text` content is necessarily visible in process arguments and should not be used for sensitive material. Later artifacts may contain facts derived from the source and must be treated as private unless reviewed.

A seed stabilizes the local creative palette. It cannot make remote model sampling deterministic.

## Contracts and safety

The dependency-free Node runtime enforces:

- strict object keys;
- one to three literal anchors;
- source material as an optional selection pool;
- exact section order and line contracts;
- an eight-word maximum for the hook core phrase;
- at most two motifs per Songfilm section;
- occurrence-specific directives such as `Chorus#2`;
- exact directive placement and single occurrence;
- title, character, placeholder, anchor, and section checks.

Source values are serialized as JSON and encode `<`, `>`, and `&` before insertion into XML-like prompt blocks. Source instructions are data, not authority.

The bundled RoastGPT system prompt is a normalized text-identical copy of the supplied source attachment. Its original source hash and every active bundled prompt hash are recorded in `assets/prompts/v1/manifest.v5.json`. Earlier manifests and prompt variants remain immutable for auditability. Public validation verifies the bundled normalized hash. A source holder can additionally set `AI_RAP_STUDIO_ROASTGPT_SOURCE` to independently compare an external source file; its local path is never published.

## Failure behavior

The adapter distinguishes:

- missing `agy`;
- missing required model;
- wrapper timeout;
- nonzero provider exit;
- empty stdout;
- oversized Windows command-line prompts;
- invalid JSON;
- schema or output-contract failures.

It never activates another model automatically. Failed lyrics remain visible in the ignored run directory and are not silently rewritten. A failed final evaluation returns exit code `3`.

The current Windows-safe prompt limit is 28,000 characters, with source input capped at 12,000 characters. The installed `agy` CLI does not document stdin or structured-output support.

## Development

Run all dependency-free tests:

```powershell
npm test
npm run validate
.\scripts\validate-plugin-v2.ps1
git diff --check
```

CI uses synthetic fixtures and an injected fake inference boundary. It never authenticates to `agy` or performs paid inference.

After local plugin changes, reinstall through the registered personal marketplace:

```powershell
.\scripts\reinstall-plugin-v1.ps1
```

Start a new Codex task after reinstalling so the updated skill metadata is loaded.

## Project structure

```text
.codex-plugin/          Plugin manifest
assets/prompts/v1/      Immutable prompt package and integrity manifest
runtime/v1/             agy adapter, schemas, prompt rendering, pipeline
scripts/                Versioned CLI, validation, and reinstall entry points
skills/                 Orchestrator and focused stage skills
test/                   Dependency-free Node contract tests
```

## License

This repository is public but currently `UNLICENSED`. Public visibility does not grant permission to copy, modify, or redistribute the code.
