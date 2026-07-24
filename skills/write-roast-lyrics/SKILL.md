---
name: write-roast-lyrics
description: Render Suno-compatible roast-rap lyrics from an already validated StructuredBriefing and SongFilmPlan using the immutable versioned RoastGPT system prompt through agy with gemini-3.1-pro-high. Use when Codex needs the final lyrics stage, deterministic Suno contract checks, or a retry after a failed lyric-output gate.
---

# Write Roast Lyrics

Require both a validated briefing and SongFilmPlan:

```powershell
.\scripts\ai-rap-studio-v1.ps1 lyrics `
  --briefing .\outputs\<run>\03-structured-briefing.json `
  --songfilm .\outputs\<run>\04-songfilm-plan.json
```

The command must use:

- `assets/prompts/v1/lyrics.system.roastgpt.v1.md`;
- `assets/prompts/v1/lyrics.user.v4.md`;
- `agy` with exactly `gemini-3.1-pro-high`;
- sandbox and plan mode;
- no fallback model.

Do not edit or silently repair failed lyrics. Preserve the raw output in the ignored run directory and report the failed checks. Retry only as an explicit new inference. Keep internal prompts, source material, and generated private lyrics out of commits, issues, and logs.
