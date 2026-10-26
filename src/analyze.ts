import nlp from "compromise";
import writeGood from "write-good";
import { sourceSpans } from "./prose";
import { type Category, type Chunk, type Mark, parts, type Settings, type Span } from "./types";

const checks: Record<Exclude<Category, "custom">, string[]> = {
  wordiness: ["tooWordy"],
  unnecessary: ["so", "thereIs"],
  cliches: ["cliches"],
  qualifiers: ["weasel", "adverb"],
  repeated: ["illusion"],
  passive: ["passive"],
};
const disabled = Object.fromEntries(
  [...Object.values(checks).flat(), "eprime"].map((key) => [key, false]),
);
const normalized = (text: string) => text.replace(/[‘’]/g, "'");
const word = (char: string) => /[\p{L}\p{N}_]/u.test(char);

/** Literal, case-insensitive whole phrases; no user-provided executable regex. */
export function occurrences(text: string, phrase: string): Span[] {
  const expression = normalized(phrase)
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const spans: Span[] = [];
  for (const match of normalized(text).matchAll(new RegExp(expression, "giu"))) {
    const from = match.index;
    const to = from + match[0].length;
    const before = Array.from(text.slice(0, from)).at(-1) ?? "";
    const after = Array.from(text.slice(to, to + 2))[0] ?? "";
    if ((!word(phrase[0]) || !word(before)) && (!word(phrase.at(-1) ?? "") || !word(after)))
      spans.push({ from, to });
  }
  return spans;
}

export function analyzeText(text: string, settings: Settings): Mark[] {
  const marks: Mark[] = [];
  if (!settings.syntax && !settings.style) return marks;
  const terms: { from: number; to: number; tags: string[] }[] = [];
  {
    const sentences = nlp(text).json({ offset: true }) as {
      terms: { tags: string[]; offset: { start: number; length: number } }[];
    }[];
    for (const sentence of sentences)
      for (const term of sentence.terms) {
        const part = parts.find((part) => settings.parts[part] && term.tags.includes(part));
        const from = term.offset.start;
        let to = from + term.offset.length;
        // Compromise can assign a noun tag to a fragment of a multi-codepoint emoji.
        // Only decorate lexical terms, and keep trailing combining accents attached.
        if (/\p{L}/u.test(text.slice(from, to))) {
          while (to < text.length && /\p{M}/u.test(text[to])) to++;
          terms.push({ from, to, tags: term.tags });
          if (settings.syntax && part) marks.push({ from, to, part });
        }
      }
  }
  if (!settings.style) return marks;
  const exceptions = settings.exceptions.flatMap((phrase) => occurrences(text, phrase));
  function add(from: number, to: number, category: Category, reason: string) {
    if (
      from < 0 ||
      to > text.length ||
      from >= to ||
      exceptions.some((span) => span.from <= from && span.to >= to)
    )
      return;
    const covered = terms.filter((term) => term.from < to && term.to > from);
    const tags = covered.length === 1 ? covered[0].tags : [];
    const speech =
      covered.length > 1
        ? "Phrase"
        : (["Pronoun", "Determiner", "Preposition", ...parts, "Interjection", "QuestionWord"].find(
            (tag) => tags.includes(tag),
          ) ?? "Word");
    marks.push({ from, to, category, reason, speech, phrase: text.slice(from, to) });
  }
  for (const [category, names] of Object.entries(checks)) {
    if (!settings.categories[category as Category]) continue;
    const options = { ...disabled, ...Object.fromEntries(names.map((key) => [key, true])) };
    for (const suggestion of writeGood(normalized(text), options))
      add(
        suggestion.index,
        suggestion.index + suggestion.offset,
        category as Category,
        suggestion.reason,
      );
  }
  if (settings.categories.custom)
    for (const rule of settings.rules) {
      // write-good supports supplied check functions; call separately to retain its built-ins.
      for (const suggestion of writeGood(text, {
        checks: {
          phrase: {
            fn: (input) =>
              occurrences(input, rule.phrase).map((span) => ({
                index: span.from,
                offset: span.to - span.from,
              })),
            explanation: rule.reason,
          },
        },
      }))
        add(suggestion.index, suggestion.index + suggestion.offset, "custom", suggestion.reason);
    }
  return marks;
}

export function mapMarks(chunk: Chunk, marks: Mark[]): Mark[] {
  return marks.flatMap((mark) =>
    sourceSpans(chunk, mark.from, mark.to).map((span) => ({ ...mark, ...span })),
  );
}
