import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractError,
  evaluateLyricsOutput,
  parseLyricsOutput,
  validateSectionContract,
  validateIdeaInput,
  validateSongFilmPlan,
  validateSongIdeas,
  validateStructuredBriefing
} from "../runtime/v1/contracts-v1.mjs";

function briefing(overrides = {}) {
  return {
    version: "ai-rap-studio-briefing-v1",
    language: "de",
    perspective: "Ich-Erzähler",
    immutableFacts: ["Synthetic test fixture"],
    literalAnchors: ["Kiosk"],
    concept: { premise: "A tiny status conflict", arc: "Pose becomes evidence" },
    music: {
      sound: "Boom-bap",
      vocalDesign: "Dry lead",
      stylePrompt: "Boom-bap, 92 BPM",
      negativeStylePrompt: "No drill, no industrial"
    },
    sourceMaterial: {
      character: ["A boastful coworker"],
      places: ["Kiosk"],
      objectsAndSignals: ["Empty trophy"]
    },
    selectionPolicy: "Select at most two motifs per section.",
    writing: { tone: "Sharp", flow: "Compact", hook: "Short core phrase" },
    constraints: {
      boundaries: "Behavior only",
      avoid: "No placeholders",
      structure: "Intro and Chorus",
      verseContract: "No verse in this fixture",
      hookContract: "Two lines",
      maxLyricsCharacters: 5000,
      maxTitleWords: 5
    },
    ...overrides
  };
}

function plan(overrides = {}) {
  return {
    creativeDna: {
      characterCore: "A status pose",
      centralTension: "Claims versus evidence",
      world: "Night kiosk",
      sonicArc: "Sparse to loud"
    },
    hook: {
      corePhrase: "Kiosk ohne Krone",
      melodicShape: "Short descending phrase",
      finalVariation: "Crowd response"
    },
    sections: [
      {
        name: "Intro",
        purpose: "Establish the pose",
        scene: "Outside the kiosk",
        change: "The claim is questioned",
        motifs: ["Empty trophy"],
        flow: "Dry spoken delivery",
        rhyme: "Loose setup rhymes"
      },
      {
        name: "Chorus",
        purpose: "Condense the contradiction",
        scene: "The crowd answers",
        change: "The pose collapses",
        motifs: ["Kiosk"],
        flow: "Bouncy call and response",
        rhyme: "Tight multisyllabic chain"
      }
    ],
    continuity: ["The trophy remains empty."],
    qualityRisks: ["Avoid explanatory hook lines."],
    ...overrides
  };
}

test("song ideas reject unknown keys", () => {
  assert.throws(
    () =>
      validateSongIdeas({
        ideas: [
          {
            id: "one",
            workingTitle: "One",
            premise: "Premise",
            perspective: "Perspective",
            centralTension: "Tension",
            hookPromise: "Promise",
            tone: "Tone",
            energy: "Energy",
            scenesOrMotifs: ["A", "B"],
            leaked: true
          }
        ]
      }),
    ContractError
  );
});

test("file-backed idea input carries a reference and hash, not source content", () => {
  const validated = validateIdeaInput({
    mode: "source",
    language: "de",
    count: 1,
    source: {
      label: "source.txt",
      fileReference: "C:\\isolated\\source.txt",
      contentSha256: "a".repeat(64),
      contentCharacters: 42
    }
  });
  assert.equal(validated.source.fileReference, "C:\\isolated\\source.txt");
  assert.equal(Object.hasOwn(validated.source, "content"), false);
});

test("briefing is strict and limits literal anchors", () => {
  assert.equal(validateStructuredBriefing(briefing()).literalAnchors.length, 1);
  assert.throws(
    () => validateStructuredBriefing(briefing({ literalAnchors: ["a", "b", "c", "d"] })),
    /1-3 text entries/
  );
  assert.throws(() => validateStructuredBriefing({ ...briefing(), extra: true }), /unexpected key/);
});

test("songfilm enforces section order, motifs, and directive occurrence placement", () => {
  const contract = validateSectionContract({
    sections: [
      { name: "Chorus", lines: 2 },
      { name: "Chorus", lines: 2 }
    ]
  });
  const withDirective = briefing({
    sunoDirectives: [{ placement: "Chorus#2", tag: "[Beat Switch]" }]
  });
  const repeatedPlan = plan({
    sections: [
      { ...plan().sections[1], flow: "First chorus flow" },
      { ...plan().sections[1], flow: "Second chorus flow [Beat Switch]" }
    ]
  });
  assert.equal(validateSongFilmPlan(repeatedPlan, contract, withDirective).sections.length, 2);
  assert.throws(
    () =>
      validateSongFilmPlan(
        repeatedPlan,
        contract,
        briefing({ sunoDirectives: [{ placement: "Chorus", tag: "[Beat Switch]" }] })
      ),
    /ambiguous/
  );
  assert.throws(
    () =>
      validateSongFilmPlan(
        { ...repeatedPlan, extra: true },
        contract,
        withDirective
      ),
    /unexpected key/
  );
});

test("lyrics parser and evaluator validate section order and performable lines", () => {
  const raw = `# [Kiosk ohne Krone]

**Style Tags:** Boom-Bap, 92 BPM, Cocky

**[Intro]**
[Dry Spoken Flow]
Kiosk im Regen
Pokal ohne Namen

**[Chorus]**
[Bouncy Call and Response]
Kiosk ohne Krone
Kiosk ohne Krone`;
  const parsed = parseLyricsOutput(raw);
  const contract = validateSectionContract({
    sections: [
      { name: "Intro", lines: 2 },
      { name: "Chorus", lines: 2 }
    ]
  });
  const evaluation = evaluateLyricsOutput(parsed, briefing(), contract);
  assert.equal(evaluation.passed, true);
  assert.deepEqual(
    evaluation.sectionLineCounts.map((entry) => entry.lines),
    [2, 2]
  );
});

test("lyrics parser rejects corrupted Unicode replacement characters", () => {
  assert.throws(
    () =>
      parseLyricsOutput(`# [Pl��sch]\n\n**Style Tags:** Boom-Bap\n\n**[Intro]**\nEine Zeile`),
    /Unicode replacement/
  );
});

test("lyrics evaluation checks occurrence-specific Suno directives", () => {
  const raw = `# [Kiosk]

**Style Tags:** Boom-Bap, 92 BPM

**[Chorus]**
Kiosk eins

**[Chorus]**
[Beat Switch]
Kiosk zwei`;
  const contract = validateSectionContract({
    sections: [
      { name: "Chorus", lines: 1 },
      { name: "Chorus", lines: 1 }
    ]
  });
  const parsed = parseLyricsOutput(raw);
  const good = evaluateLyricsOutput(
    parsed,
    briefing({ sunoDirectives: [{ placement: "Chorus#2", tag: "[Beat Switch]" }] }),
    contract
  );
  assert.equal(good.checks.requiredDirectivesValid, true);
  const wrong = evaluateLyricsOutput(
    parsed,
    briefing({ sunoDirectives: [{ placement: "Chorus#1", tag: "[Beat Switch]" }] }),
    contract
  );
  assert.equal(wrong.checks.requiredDirectivesValid, false);
});
