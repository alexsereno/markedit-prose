import { describe, expect, test } from "bun:test";
import { parser } from "@lezer/markdown";
import { analyzeText, mapMarks, occurrences } from "../src/analyze";
import { project } from "../src/prose";
import { Revision } from "../src/revision";
import { defaults, parseSettings } from "../src/settings";

function analyze(source: string, settings = defaults()) {
  return project(source, parser.parse(source)).flatMap((chunk) =>
    mapMarks(chunk, analyzeText(chunk.text, settings)),
  );
}
const slices = (source: string, predicate: (mark: ReturnType<typeof analyze>[number]) => boolean) =>
  analyze(source)
    .filter(predicate)
    .map((mark) => ({ text: source.slice(mark.from, mark.to), from: mark.from }));

describe("source positions and Markdown", () => {
  test("repeated words use their own offsets, including after emoji and curly contractions", () => {
    const source = "😀 Cats don’t run. Cats run quickly and cats run.";
    const cats = slices(source, (mark) => mark.part === "Noun").filter(
      (mark) => mark.text.toLowerCase() === "cats",
    );
    expect(cats.map((mark) => mark.from)).toEqual([3, 19, 40]);
    const contraction = slices(source, (mark) => mark.part === "Verb").find(
      (mark) => mark.text === "don’t",
    );
    expect(contraction?.from).toBe(8);
  });
  test("excludes code blocks, inline code, destinations and reference definitions", () => {
    const source =
      '# **Visible cats**\n\n[very very cats](https://very.example/very)\n\n```js\nvery very cats\n```\n\n    very very cats\n\n`very very cats`\n\n[visible dogs][id]\n\n[id]: https://very.example "very title"';
    const chunks = project(source, parser.parse(source));
    const text = chunks.map((chunk) => chunk.text).join("|");
    expect(text).toContain("Visible cats");
    expect(text).toContain("very very cats");
    expect(text).toContain("visible dogs");
    expect(text).not.toContain("https:");
    expect(text).not.toContain("title");
    expect(text.match(/very very cats/g)).toHaveLength(1);
    for (const mark of analyze(source))
      expect(source.slice(mark.from, mark.to)).not.toMatch(/[*`[\]#]/);
  });
  test("formatting inside a word or phrase maps separate spans without decorating syntax", () => {
    const source = "😀 in **order** to act, a ca**t** runs.";
    const settings = defaults();
    settings.rules = [{ phrase: "in order to", reason: "consider to" }];
    const custom = analyze(source, settings).filter((mark) => mark.category === "custom");
    expect(custom.map((mark) => source.slice(mark.from, mark.to))).toEqual(["in ", "order", " to"]);
    expect(custom[0].from).toBe(3);
    const nouns = analyze(source)
      .filter((mark) => mark.part === "Noun")
      .map((mark) => source.slice(mark.from, mark.to));
    expect(nouns).toContain("ca");
    expect(nouns).toContain("t");
  });
  test("excluded code is a phrase boundary", () => {
    expect(analyze("very `code` very").filter((mark) => mark.category === "repeated")).toHaveLength(
      0,
    );
    expect(
      analyze("very **very**")
        .filter((mark) => mark.category === "repeated")
        .map((mark) => mark.from),
    ).toEqual([7]);
  });
  test("UTF-16 indexes remain valid through variation selectors, combining marks and escapes", () => {
    const source = "👩🏽‍💻 café é “really” \\*cats\\* and cats.";
    for (const mark of analyze(source)) {
      expect(mark.from).toBeGreaterThanOrEqual(0);
      expect(mark.to).toBeLessThanOrEqual(source.length);
      expect(source.slice(mark.from, mark.to)).not.toContain("\\");
    }
    expect(
      slices(source, (mark) => Boolean(mark.part))
        .filter((mark) => mark.text === "cats")
        .map((mark) => mark.from),
    ).toEqual([27, 38]);
  });
});

describe("style suggestions", () => {
  test("keeps overlapping suggestions and respects category switches", () => {
    const settings = defaults();
    settings.rules = [{ phrase: "very very", reason: "Consider a precise description" }];
    const marks = analyze("very very clear", settings);
    expect(marks.some((mark) => mark.category === "repeated" && mark.from === 5)).toBe(true);
    expect(
      marks.some((mark) => mark.category === "custom" && mark.from === 0 && mark.to === 9),
    ).toBe(true);
    settings.categories.repeated = false;
    expect(analyze("very very clear", settings).some((mark) => mark.category === "repeated")).toBe(
      false,
    );
  });
  test("passive voice is opt-in", () => {
    expect(
      analyze("The ball was kicked by John.").some((mark) => mark.category === "passive"),
    ).toBe(false);
    const settings = defaults();
    settings.categories.passive = true;
    expect(
      analyze("The ball was kicked by John.", settings).some((mark) => mark.category === "passive"),
    ).toBe(true);
  });
  test("exceptions work at position zero, across formatting, and every occurrence", () => {
    const settings = defaults();
    settings.exceptions = ["very"];
    expect(analyze("very **very** very clear", settings).filter((mark) => mark.reason)).toEqual([]);
    expect(occurrences("Very very VERY", "very").map((span) => span.from)).toEqual([0, 5, 10]);
    expect(occurrences("cat concatenate cat 🐈 cat", "cat").map((span) => span.from)).toEqual([
      0, 16, 23,
    ]);
  });
  test("custom literals escape regex syntax and normalize curly quotes", () => {
    expect(occurrences("C++ C++ a+b", "C++")).toEqual([
      { from: 0, to: 3 },
      { from: 4, to: 7 },
    ]);
    expect(occurrences("don’t don't", "don't")).toEqual([
      { from: 0, to: 5 },
      { from: 6, to: 11 },
    ]);
  });
  test("masters disable their own layers", () => {
    const settings = defaults();
    settings.syntax = false;
    expect(analyze("Very very clear cats run.", settings).some((mark) => mark.part)).toBe(false);
    settings.style = false;
    expect(analyze("Very very clear cats run.", settings)).toEqual([]);
  });
});

describe("edits and configuration", () => {
  test("old snapshots are rejected after edits and newer requests", () => {
    const revision = new Revision();
    const old = revision.next();
    revision.next();
    expect(revision.accepts(old)).toBe(false);
    const current = revision.next();
    expect(revision.accepts(current)).toBe(true);
    const before = "cats run";
    const after = "😀 cats run";
    expect(slices(before, (mark) => mark.part === "Noun")[0].from).toBe(0);
    expect(slices(after, (mark) => mark.part === "Noun")[0].from).toBe(3);
  });
  test("bounded chunks preserve every prose position", () => {
    const source = "Cats run quickly. ".repeat(1000);
    const chunks = project(source, parser.parse(source));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.text).join("")).toBe(source);
    expect(chunks.flatMap((chunk) => chunk.positions)).toEqual(
      Array.from({ length: source.length }, (_, i) => i),
    );
    expect(Math.max(...chunks.map((chunk) => chunk.text.length))).toBeLessThan(3100);
  });
  test("settings round trip and malformed data is rejected", () => {
    const settings = defaults();
    settings.exceptions = ["really"];
    settings.rules = [{ phrase: "quite", reason: "Consider specificity" }];
    expect(parseSettings(JSON.stringify(settings))).toEqual(settings);
    expect(() => parseSettings('{"exceptions":[1]}')).toThrow();
    expect(() => parseSettings('{"categories":{"passive":"true"}}')).toThrow();
  });
});

test("style explanations retain parts of speech when colors are disabled", () => {
  const settings = defaults();
  settings.syntax = false;
  settings.parts.Adverb = false;
  const marks = analyzeText("An excellent cat runs really quickly in order to escape.", settings);
  expect(marks.find((mark) => mark.phrase === "excellent")?.speech).toBe("Adjective");
  expect(marks.find((mark) => mark.phrase === "really")?.speech).toBe("Adverb");
  expect(marks.find((mark) => mark.phrase === "in order to")?.speech).toBe("Phrase");
  expect(marks.some((mark) => mark.part)).toBe(false);
});
