import { categories, parts, type Settings } from "./types";

export function defaults(): Settings {
  return {
    syntax: true,
    style: true,
    parts: { Noun: true, Verb: true, Adjective: true, Adverb: true, Conjunction: true },
    categories: {
      wordiness: true,
      unnecessary: true,
      cliches: true,
      qualifiers: true,
      repeated: true,
      passive: false,
      custom: true,
    },
    exceptions: [],
    rules: [],
  };
}

export function parseSettings(json: string): Settings {
  const value = JSON.parse(json);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a settings object.");
  const result = defaults();
  for (const key of ["syntax", "style"] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "boolean") throw new Error(`${key} must be true or false.`);
      result[key] = value[key];
    }
  }
  for (const [key, names] of [
    ["parts", parts],
    ["categories", categories],
  ] as const) {
    for (const name of names) {
      const entry = value[key]?.[name];
      if (entry !== undefined) {
        if (typeof entry !== "boolean") throw new Error(`${name} must be true or false.`);
        (result[key] as Record<string, boolean>)[name] = entry;
      }
    }
  }
  if (value.exceptions !== undefined) {
    if (
      !Array.isArray(value.exceptions) ||
      !value.exceptions.every(
        (x: unknown) => typeof x === "string" && x.trim().length > 0 && x.length <= 200,
      )
    )
      throw new Error("Exceptions must be nonempty phrases (up to 200 characters).");
    result.exceptions = [...new Set<string>(value.exceptions.map((x: string) => x.trim()))];
  }
  if (value.rules !== undefined) {
    if (
      !Array.isArray(value.rules) ||
      !value.rules.every(
        (x: { phrase?: unknown; reason?: unknown }) =>
          x &&
          typeof x.phrase === "string" &&
          x.phrase.trim().length > 0 &&
          x.phrase.length <= 200 &&
          typeof x.reason === "string" &&
          x.reason.trim().length > 0 &&
          x.reason.length <= 500,
      )
    )
      throw new Error("Rules need a phrase (1–200 characters) and reason (1–500 characters).");
    result.rules = value.rules.map((x: { phrase: string; reason: string }) => ({
      phrase: x.phrase.trim(),
      reason: x.reason.trim(),
    }));
  }
  return result;
}
