---
name: plan-rap-songfilm
description: Convert a selected SongIdea into a strict StructuredBriefing and convert that briefing into a validated SongFilmPlan with scene, change, motif, flow, rhyme, continuity, and risk contracts. Use when Codex needs rap briefing compilation, Songfilm or Soundfilm planning, section-contract validation, or a resumable pre-lyrics planning artifact.
---

# Plan a Rap Songfilm

Keep briefing compilation and Songfilm planning separate from lyric writing.

## From SongIdea to briefing

```powershell
.\scripts\ai-rap-studio-v1.ps1 briefing --idea .\outputs\<run>\02-song-ideas.json --idea-index 0
```

## From briefing to SongFilmPlan

```powershell
.\scripts\ai-rap-studio-v1.ps1 songfilm --briefing .\outputs\<run>\03-structured-briefing.json
```

Accept `soundfilm` as a CLI alias, but use `Songfilm` and `SongFilmPlan` in artifacts and explanations.

Validate before proceeding:

- strict keys at every object level;
- one to three literal anchors;
- source material remains an optional pool;
- exact section order and line contract;
- hook core phrase no longer than eight words;
- zero to two motifs per section;
- repeated sections use occurrence keys such as `Chorus#2` for directives;
- every directive tag appears exactly once in the intended flow;
- no lyrics inside the plan.

Do not invent missing personal facts. Do not pass an invalid plan to the lyric writer.
