const STATUS_SENTENCE = "Nicht belegt; für kreative Ausarbeitung offen.";

export const MODEL = "gemini-3.1-pro-high";
export const SCHEMA_VERSION = "ai-rap-studio-v1";
export const DEFAULT_SECTION_CONTRACT = Object.freeze({
  sections: Object.freeze([
    Object.freeze({ name: "Intro", lines: 2 }),
    Object.freeze({ name: "Verse 1", lines: 16 }),
    Object.freeze({ name: "Chorus", lines: 4 }),
    Object.freeze({ name: "Verse 2", lines: 16 }),
    Object.freeze({ name: "Pre-Chorus", lines: 4 }),
    Object.freeze({ name: "Chorus", lines: 4 }),
    Object.freeze({ name: "Verse 3", lines: 16 }),
    Object.freeze({ name: "Bridge", lines: 4 }),
    Object.freeze({ name: "Chorus", lines: 4 }),
    Object.freeze({ name: "Outro", lines: 2 })
  ])
});

export class ContractError extends Error {
  constructor(message, path = "$") {
    super(`${path}: ${message}`);
    this.name = "ContractError";
    this.path = path;
  }
}

function plainObject(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ContractError("expected an object", path);
  }
  return value;
}

function exactKeys(value, allowed, required, path) {
  const keys = Object.keys(value);
  for (const key of keys) {
    if (!allowed.includes(key)) throw new ContractError(`unexpected key "${key}"`, path);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new ContractError(`missing key "${key}"`, path);
  }
}

function text(value, path) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ContractError("expected non-empty text", path);
  }
  if (value.includes("\uFFFD")) {
    throw new ContractError("contains Unicode replacement characters", path);
  }
  return value.trim();
}

function integer(value, path, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ContractError(`expected an integer from ${min} to ${max}`, path);
  }
  return value;
}

function textList(value, path, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ContractError(`expected ${min}-${max} text entries`, path);
  }
  return value.map((entry, index) => text(entry, `${path}[${index}]`));
}

function objectWithTextFields(value, fields, path) {
  const object = plainObject(value, path);
  return Object.fromEntries(fields.map((field) => [field, text(object[field], `${path}.${field}`)]));
}

function strictTextObject(value, fields, path) {
  const object = plainObject(value, path);
  exactKeys(object, fields, fields, path);
  return objectWithTextFields(object, fields, path);
}

export function validateIdeaInput(value) {
  const object = plainObject(value, "$");
  const allowed = ["mode", "language", "count", "seed", "creativeDirection", "source"];
  exactKeys(object, allowed, ["mode", "language", "count"], "$");
  if (!["random", "source"].includes(object.mode)) {
    throw new ContractError('expected "random" or "source"', "$.mode");
  }
  const result = {
    mode: object.mode,
    language: text(object.language, "$.language"),
    count: integer(object.count, "$.count", { min: 1, max: 8 })
  };
  if (object.seed !== undefined) result.seed = text(String(object.seed), "$.seed");
  if (object.creativeDirection !== undefined) {
    result.creativeDirection = text(object.creativeDirection, "$.creativeDirection");
  }
  if (object.mode === "source") {
    const source = plainObject(object.source, "$.source");
    const hasContent = Object.hasOwn(source, "content");
    const hasFileReference = Object.hasOwn(source, "fileReference");
    if (hasContent === hasFileReference) {
      throw new ContractError(
        "provide exactly one of content or fileReference",
        "$.source"
      );
    }
    if (hasContent) {
      exactKeys(source, ["label", "content"], ["label", "content"], "$.source");
      result.source = {
        label: text(source.label, "$.source.label"),
        content: text(source.content, "$.source.content")
      };
    } else {
      const fields = ["label", "fileReference", "contentSha256", "contentCharacters"];
      exactKeys(source, fields, fields, "$.source");
      result.source = {
        label: text(source.label, "$.source.label"),
        fileReference: text(source.fileReference, "$.source.fileReference"),
        contentSha256: text(source.contentSha256, "$.source.contentSha256"),
        contentCharacters: integer(
          source.contentCharacters,
          "$.source.contentCharacters",
          { min: 1, max: 12_000 }
        )
      };
      if (!/^[a-f0-9]{64}$/u.test(result.source.contentSha256)) {
        throw new ContractError("expected a lowercase SHA-256", "$.source.contentSha256");
      }
    }
  } else if (object.source !== undefined) {
    throw new ContractError("random mode must not contain source data", "$.source");
  }
  return result;
}

export function validateSongIdeas(value) {
  const object = plainObject(value, "$");
  exactKeys(object, ["ideas"], ["ideas"], "$");
  if (!Array.isArray(object.ideas) || object.ideas.length < 1 || object.ideas.length > 8) {
    throw new ContractError("expected 1-8 ideas", "$.ideas");
  }
  const seen = new Set();
  const ideas = object.ideas.map((candidate, index) => {
    const path = `$.ideas[${index}]`;
    const item = plainObject(candidate, path);
    const fields = [
      "id",
      "workingTitle",
      "premise",
      "perspective",
      "centralTension",
      "hookPromise",
      "tone",
      "energy"
    ];
    exactKeys(item, [...fields, "scenesOrMotifs"], [...fields, "scenesOrMotifs"], path);
    const result = objectWithTextFields(item, fields, path);
    result.scenesOrMotifs = textList(item.scenesOrMotifs, `${path}.scenesOrMotifs`, {
      min: 2,
      max: 8
    });
    if (seen.has(result.id)) throw new ContractError("duplicate idea id", `${path}.id`);
    seen.add(result.id);
    return result;
  });
  return { ideas };
}

function validateSourceMaterial(value, path) {
  const object = plainObject(value, path);
  const fields = ["character", "places", "objectsAndSignals"];
  exactKeys(object, fields, fields, path);
  return Object.fromEntries(
    fields.map((field) => [
      field,
      textList(object[field], `${path}.${field}`, { min: 1, max: 30 })
    ])
  );
}

function validateConstraints(value, path) {
  const object = plainObject(value, path);
  const textFields = [
    "boundaries",
    "avoid",
    "structure",
    "verseContract",
    "hookContract"
  ];
  const fields = [...textFields, "maxLyricsCharacters", "maxTitleWords"];
  exactKeys(object, fields, fields, path);
  return {
    ...objectWithTextFields(object, textFields, path),
    maxLyricsCharacters: integer(object.maxLyricsCharacters, `${path}.maxLyricsCharacters`, {
      max: 5000
    }),
    maxTitleWords: integer(object.maxTitleWords, `${path}.maxTitleWords`, { max: 5 })
  };
}

function validateDirectives(value, path) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new ContractError("expected 1-20 directives", path);
  }
  return value.map((candidate, index) => {
    const itemPath = `${path}[${index}]`;
    return strictTextObject(candidate, ["placement", "tag"], itemPath);
  });
}

export function validateStructuredBriefing(value) {
  const object = plainObject(value, "$");
  const required = [
    "version",
    "language",
    "perspective",
    "immutableFacts",
    "literalAnchors",
    "concept",
    "music",
    "sourceMaterial",
    "selectionPolicy",
    "writing",
    "constraints"
  ];
  exactKeys(object, [...required, "sunoDirectives"], required, "$");
  const result = {
    version: text(object.version, "$.version"),
    language: text(object.language, "$.language"),
    perspective: text(object.perspective, "$.perspective"),
    immutableFacts: textList(object.immutableFacts, "$.immutableFacts", { min: 1, max: 30 }),
    literalAnchors: textList(object.literalAnchors, "$.literalAnchors", { min: 1, max: 3 }),
    concept: strictTextObject(object.concept, ["premise", "arc"], "$.concept"),
    music: strictTextObject(
      object.music,
      ["sound", "vocalDesign", "stylePrompt", "negativeStylePrompt"],
      "$.music"
    ),
    sourceMaterial: validateSourceMaterial(object.sourceMaterial, "$.sourceMaterial"),
    selectionPolicy: text(object.selectionPolicy, "$.selectionPolicy"),
    writing: strictTextObject(object.writing, ["tone", "flow", "hook"], "$.writing"),
    constraints: validateConstraints(object.constraints, "$.constraints")
  };
  if (object.sunoDirectives !== undefined) {
    result.sunoDirectives = validateDirectives(object.sunoDirectives, "$.sunoDirectives");
  }
  const anchors = new Set(result.literalAnchors.map((entry) => entry.toLocaleLowerCase("de-DE")));
  if (anchors.has(STATUS_SENTENCE.toLocaleLowerCase("de-DE"))) {
    throw new ContractError("the missing-data status cannot be a literal anchor", "$.literalAnchors");
  }
  return result;
}

export function validateSectionContract(value) {
  const object = plainObject(value, "$");
  exactKeys(object, ["sections"], ["sections"], "$");
  if (!Array.isArray(object.sections) || object.sections.length < 1 || object.sections.length > 30) {
    throw new ContractError("expected 1-30 sections", "$.sections");
  }
  return {
    sections: object.sections.map((candidate, index) => {
      const path = `$.sections[${index}]`;
      const section = plainObject(candidate, path);
      exactKeys(section, ["name", "lines", "minLines", "maxLines"], ["name"], path);
      const result = { name: text(section.name, `${path}.name`) };
      if (section.lines !== undefined) {
        result.lines = integer(section.lines, `${path}.lines`, { max: 64 });
      }
      if (section.minLines !== undefined) {
        result.minLines = integer(section.minLines, `${path}.minLines`, { max: 64 });
      }
      if (section.maxLines !== undefined) {
        result.maxLines = integer(section.maxLines, `${path}.maxLines`, { max: 64 });
      }
      if (
        result.lines === undefined &&
        result.minLines === undefined &&
        result.maxLines === undefined
      ) {
        throw new ContractError("provide lines or a line range", path);
      }
      if (
        result.minLines !== undefined &&
        result.maxLines !== undefined &&
        result.minLines > result.maxLines
      ) {
        throw new ContractError("minLines exceeds maxLines", path);
      }
      return result;
    })
  };
}

export function validateSongFilmPlan(value, sectionContract, briefing) {
  const object = plainObject(value, "$");
  const topFields = ["creativeDna", "hook", "sections", "continuity", "qualityRisks"];
  exactKeys(object, topFields, topFields, "$");
  const result = {
    creativeDna: strictTextObject(
      object.creativeDna,
      ["characterCore", "centralTension", "world", "sonicArc"],
      "$.creativeDna"
    ),
    hook: strictTextObject(
      object.hook,
      ["corePhrase", "melodicShape", "finalVariation"],
      "$.hook"
    ),
    sections: [],
    continuity: textList(object.continuity, "$.continuity", { min: 1, max: 20 }),
    qualityRisks: textList(object.qualityRisks, "$.qualityRisks", { min: 1, max: 20 })
  };
  if (result.hook.corePhrase.split(/\s+/u).length > 8) {
    throw new ContractError("hook corePhrase exceeds eight words", "$.hook.corePhrase");
  }
  if (!Array.isArray(object.sections)) {
    throw new ContractError("expected an array", "$.sections");
  }
  if (object.sections.length !== sectionContract.sections.length) {
    throw new ContractError("section count does not match section contract", "$.sections");
  }
  result.sections = object.sections.map((candidate, index) => {
    const path = `$.sections[${index}]`;
    const section = plainObject(candidate, path);
    const fields = ["name", "purpose", "scene", "change", "motifs", "flow", "rhyme"];
    exactKeys(section, fields, fields, path);
    const validated = objectWithTextFields(
      section,
      ["name", "purpose", "scene", "change", "flow", "rhyme"],
      path
    );
    validated.motifs = textList(section.motifs, `${path}.motifs`, { max: 2 });
    if (validated.name !== sectionContract.sections[index].name) {
      throw new ContractError(
        `expected section "${sectionContract.sections[index].name}"`,
        `${path}.name`
      );
    }
    return validated;
  });
  const sectionOccurrenceKeys = occurrenceKeys(sectionContract.sections);
  for (const directive of briefing.sunoDirectives ?? []) {
    const matchingIndexes = sectionOccurrenceKeys
      .map((key, index) => (key === directive.placement ? index : -1))
      .filter((index) => index >= 0);
    if (matchingIndexes.length === 0) {
      const baseMatches = sectionContract.sections
        .map((section, index) => (section.name === directive.placement ? index : -1))
        .filter((index) => index >= 0);
      if (baseMatches.length === 1) matchingIndexes.push(baseMatches[0]);
      if (baseMatches.length > 1) {
        throw new ContractError(
          `directive placement "${directive.placement}" is ambiguous; use an occurrence key such as "${directive.placement}#2"`,
          "$.sunoDirectives"
        );
      }
    }
    if (matchingIndexes.length === 0) {
      throw new ContractError(
        `directive placement "${directive.placement}" is not a contract section`,
        "$.sunoDirectives"
      );
    }
    const occurrences = result.sections.reduce(
      (count, section) => count + occurrenceCount(section.flow, directive.tag),
      0
    );
    if (occurrences !== 1) {
      throw new ContractError(
        `directive tag "${directive.tag}" must occur exactly once in section flow`,
        "$.sections"
      );
    }
    const placed = matchingIndexes.some((index) =>
      result.sections[index].flow.includes(directive.tag)
    );
    if (!placed) {
      throw new ContractError(
        `directive tag "${directive.tag}" is in the wrong section`,
        "$.sections"
      );
    }
  }
  return result;
}

function occurrenceCount(value, token) {
  if (token.length === 0) return 0;
  return value.split(token).length - 1;
}

function occurrenceKeys(sections) {
  const totals = {};
  for (const section of sections) totals[section.name] = (totals[section.name] ?? 0) + 1;
  const seen = {};
  return sections.map((section) => {
    seen[section.name] = (seen[section.name] ?? 0) + 1;
    return totals[section.name] === 1 ? section.name : `${section.name}#${seen[section.name]}`;
  });
}

function countWords(value) {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function performableLines(lines) {
  return lines.filter((line) => {
    const trimmed = line.trim();
    return (
      trimmed.length > 0 &&
      !/^\[[^\]]+\]$/u.test(trimmed) &&
      !/^\([^)]*\)$/u.test(trimmed)
    );
  }).length;
}

export function parseLyricsOutput(raw) {
  const normalized = raw.replace(/\r\n/g, "\n").trim();
  const titleMatch = /^#\s+\[?([^\]\n]+)\]?\s*$/mu.exec(normalized);
  const styleMatch = /^\*\*Style Tags:\*\*\s*(.+)$/mu.exec(normalized);
  if (!titleMatch) throw new ContractError("missing '# [Song title]' heading", "$.lyrics");
  if (!styleMatch) throw new ContractError("missing '**Style Tags:**' line", "$.lyrics");
  const title = text(titleMatch[1], "$.title");
  const styleTags = text(styleMatch[1], "$.styleTags");
  const sectionPattern = /^\*\*\[([^\]\r\n]+)\]\*\*\s*$/gmu;
  const matches = [...normalized.matchAll(sectionPattern)];
  if (matches.length === 0) throw new ContractError("no bold section headings found", "$.lyrics");
  const body = normalized.slice(matches[0].index).trim();
  const sections = matches.map((match, index) => {
    const contentStart = match.index + match[0].length;
    const contentEnd = matches[index + 1]?.index ?? normalized.length;
    const content = normalized.slice(contentStart, contentEnd).trim();
    return {
      name: match[1].trim(),
      content,
      lineCount: performableLines(content.split("\n"))
    };
  });
  return { title, styleTags, lyrics: normalized, body, sections };
}

export function evaluateLyricsOutput(parsed, briefing, sectionContract) {
  const expectedSections = sectionContract.sections.map((section) => section.name);
  const actualSections = parsed.sections.map((section) => section.name);
  const sectionOrderValid =
    expectedSections.length === actualSections.length &&
    expectedSections.every((name, index) => name === actualSections[index]);
  const lineCountsValid =
    sectionOrderValid &&
    sectionContract.sections.every((contract, index) => {
      const count = parsed.sections[index].lineCount;
      return (
        (contract.lines === undefined || count === contract.lines) &&
        (contract.minLines === undefined || count >= contract.minLines) &&
        (contract.maxLines === undefined || count <= contract.maxLines)
      );
    });
  const normalizedLyrics = parsed.body.toLocaleLowerCase("de-DE");
  const anchorsPresent = briefing.literalAnchors.every((anchor) =>
    normalizedLyrics.includes(anchor.toLocaleLowerCase("de-DE"))
  );
  const placeholderCount = (
    parsed.lyrics.match(/\{\{[^}]+\}\}|\b(?:platzhalter|hier .* einf(?:ü|u)gen)\b/giu) ?? []
  ).length;
  const sectionOccurrenceKeys = occurrenceKeys(sectionContract.sections);
  const requiredDirectivesValid = (briefing.sunoDirectives ?? []).every((directive) => {
    let index = sectionOccurrenceKeys.indexOf(directive.placement);
    if (index < 0) {
      const baseIndexes = sectionContract.sections
        .map((section, candidateIndex) =>
          section.name === directive.placement ? candidateIndex : -1
        )
        .filter((candidateIndex) => candidateIndex >= 0);
      if (baseIndexes.length === 1) index = baseIndexes[0];
    }
    if (index < 0) return false;
    const totalOccurrences = parsed.sections.reduce(
      (count, section) => count + occurrenceCount(section.content, directive.tag),
      0
    );
    return (
      totalOccurrences === 1 &&
      occurrenceCount(parsed.sections[index].content, directive.tag) === 1
    );
  });
  const checks = {
    titleWithinLimit: countWords(parsed.title) <= briefing.constraints.maxTitleWords,
    lyricsWithinLimit: parsed.body.length <= briefing.constraints.maxLyricsCharacters,
    sectionOrderValid,
    lineCountsValid,
    anchorsPresent,
    noPlaceholders: placeholderCount === 0,
    noEncodingReplacement: !parsed.lyrics.includes("\uFFFD"),
    requiredDirectivesValid
  };
  return {
    checks,
    passed: Object.values(checks).every(Boolean),
    titleWordCount: countWords(parsed.title),
    lyricsCharacterCount: parsed.body.length,
    placeholderCount,
    sectionLineCounts: parsed.sections.map((section) => ({
      name: section.name,
      lines: section.lineCount
    }))
  };
}

export function validateArtifact(type, value, context = {}) {
  if (type === "idea-input") return validateIdeaInput(value);
  if (type === "song-ideas") return validateSongIdeas(value);
  if (type === "briefing") return validateStructuredBriefing(value);
  if (type === "section-contract") return validateSectionContract(value);
  if (type === "songfilm") {
    if (!context.sectionContract || !context.briefing) {
      throw new ContractError("songfilm validation requires briefing and sectionContract");
    }
    return validateSongFilmPlan(value, context.sectionContract, context.briefing);
  }
  throw new ContractError(`unknown artifact type "${type}"`);
}
