import { describe, expect, test } from "bun:test";
import { analyzeText, mapMarks } from "../src/analyze";
import { project } from "../src/prose";
import { defaults } from "../src/settings";
import { fixtureParser, parseMarkdown } from "./fixtures/language";

function inspect(source: string) {
  const tree = parseMarkdown(source);
  const chunks = project(source, tree, fixtureParser);
  const marks = chunks.flatMap((chunk) => mapMarks(chunk, analyzeText(chunk.text, defaults())));
  return { tree, chunks, text: chunks.map((chunk) => chunk.text).join("|"), marks };
}
function noMarksIn(source: string, excluded: string) {
  const from = source.indexOf(excluded);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(
    inspect(source).marks.some((mark) => mark.from < from + excluded.length && mark.to > from),
  ).toBe(false);
}

describe("MarkEdit Markdown grammar", () => {
  test("native reference identifiers, URLs, and titles are all metadata", () => {
    const source =
      'Read [very very clear][very].\n\n[very]: https://very.example/very "very very title"\n\nCats run.';
    const result = inspect(source);
    expect(result.tree.toString()).toContain("LinkDefinition");
    expect(result.text).toContain("very very clear");
    expect(result.text).not.toContain("https");
    expect(result.text).not.toContain("title");
    noMarksIn(source, '[very]: https://very.example/very "very very title"');
  });
  test("multiline destinations and multiline titles are excluded without swallowing following prose", () => {
    const source =
      '[ref]:\n  <https://very.example>\n  "very very\n  title"\n\nCats run quickly.\n\n[other]: https://other.example\n  (really really title)\n\nDogs run.';
    const result = inspect(source);
    expect(result.text).not.toContain("https");
    expect(result.text).not.toContain("title");
    expect(result.text).toContain("Cats run quickly.");
    expect(result.text).toContain("Dogs run.");
  });
  test("reference definitions work inside blockquotes and lists", () => {
    const source =
      '> [ref]: https://very.example\n>   "very very title"\n>\n> Visible cats.\n\n- [other]: https://really.example\n    "really title"\n\nDogs run.';
    const result = inspect(source);
    expect(result.text).not.toContain("https");
    expect(result.text).not.toContain("title");
    expect(result.text).toContain("Visible cats.");
    expect(result.text).toContain("Dogs run.");
  });
  test("incomplete native reference declarations are skipped, rather than flagging their identifiers", () => {
    const source = "[very very]:\n\nCats run.";
    expect(inspect(source).text).not.toContain("very");
    expect(inspect(source).text).toContain("Cats run.");
  });
  test("footnote identifiers disappear while body and indented continuation remain prose", () => {
    const source =
      "Cats run[^very].\n\n[^very]: Very **very** clear cats.\n\n    Really useful dogs.\n\nNext paragraph.";
    const result = inspect(source);
    expect(result.text).not.toContain("^very");
    expect(result.text).toContain("Very very clear cats.");
    expect(result.text).toContain("Really useful dogs.");
    expect(result.text).toContain("Next paragraph.");
    noMarksIn(source, "[^very]");
    const repeated = result.marks.find((mark) => mark.category === "repeated");
    expect(repeated && source.slice(repeated.from, repeated.to)).toBe("very");
    expect(repeated?.from).toBe(source.indexOf("**very**") + 2);
  });
  test("code, destinations, and tags inside footnotes are still excluded", () => {
    const source =
      '[^id]: Prose `very very code` and [visible dogs](https://very.example).\n\n        very very indented code\n\n    Cats run <span title="very very">quickly</span>.\n\n    ```js\n    very very fenced code\n    ```\n\nNext paragraph.';
    const result = inspect(source);
    expect(result.text).toContain("visible dogs");
    expect(result.text).toContain("quickly");
    expect(result.text).not.toContain("code");
    expect(result.text).not.toContain("https");
    expect(result.text).not.toContain("title");
    expect(result.text).toContain("Next paragraph.");
  });
  test("footnote math uses the same host parser as the rest of the document", () => {
    const source = "[^id]: Very clear cats.\n\n    $$\\text{very very math}$$\n\n    Dogs run.";
    const result = inspect(source);
    expect(result.text).not.toContain("math");
    expect(result.text).toContain("Very clear cats.");
    expect(result.text).toContain("Dogs run.");
  });
  test("footnotes inside blockquotes preserve their indented prose", () => {
    const source = "> [^id]: Very very clear.\n>\n>     Really useful cats.\n>\n> Ordinary prose.";
    const result = inspect(source);
    expect(result.text).toContain("Very very clear.");
    expect(result.text).toContain("Really useful cats.");
    expect(result.text).toContain("Ordinary prose.");
    expect(result.text).not.toContain("^id");
  });
  test("YAML front matter and closed math blocks are excluded", () => {
    const source =
      "---\ntitle: very very\nwords: [really, really]\n---\n\nCats run.\n\n$$\\text{very very} + x$$\n\n$$\n\\text{really really}\n$$\n\nDogs run.";
    const result = inspect(source);
    expect(result.tree.toString()).toContain("Frontmatter");
    expect(result.tree.toString()).toContain("BlockMath");
    expect(result.text).not.toContain("very");
    expect(result.text).not.toContain("really");
    expect(result.text).toContain("Cats run.");
    expect(result.text).toContain("Dogs run.");
  });
  test("math recognition follows MarkEdit, without guessing about money or unclosed delimiters", () => {
    expect(inspect("Cats cost $5 and dogs cost $10.").text).toContain("Cats cost $5");
    expect(inspect("$$\nCats run.").text).toContain("Cats run.");
  });
  test("table cells stay prose, while separators cannot concatenate words or span checks across cells", () => {
    const source = "|very|very|\n|:---|---:|\n|Cats run|Dogs run|";
    const result = inspect(source);
    expect(result.text).not.toContain("|:---");
    expect(result.text).not.toContain("veryvery");
    expect(result.chunks.filter((chunk) => chunk.text === "very")).toHaveLength(2);
    expect(result.marks.some((mark) => mark.category === "repeated")).toBe(false);
    noMarksIn(source, "|:---|---:|");
  });
  test("headings, task text, quotes and list text remain prose with block boundaries", () => {
    const source =
      "# Very very clear\n\n- [x] Cats run\n- Dogs run\n\n> Cats run\n>\n> Dogs run\n\nvery\n\nvery";
    const result = inspect(source);
    expect(result.text).not.toContain("[x]");
    expect(result.text).not.toContain("#");
    expect(result.text).toContain("Cats run");
    expect(result.text).toContain("Dogs run");
    expect(result.marks.filter((mark) => mark.category === "repeated")).toHaveLength(1);
  });
  test("hard breaks preserve whitespace without decorating the backslash or trailing spaces", () => {
    for (const source of ["very\\\nvery", "very  \nvery"]) {
      const result = inspect(source);
      expect(result.text).toBe("very\nvery");
      expect(result.marks.filter((mark) => mark.category === "repeated")).toHaveLength(1);
      const firstBreak = source.indexOf("\n");
      expect(result.marks.some((mark) => mark.from < firstBreak && mark.to > 4)).toBe(false);
    }
  });
  test("inline HTML attributes and comments are skipped while surrounding text remains", () => {
    const source =
      'Cats <span title="very very">run quickly</span> and <!-- very very --> dogs run.';
    const result = inspect(source);
    expect(result.text).toContain("run quickly");
    expect(result.text).toContain("dogs run.");
    expect(result.text).not.toContain("very");
    expect(result.text).not.toContain("title");
  });
  test("source positions remain exact after metadata, emoji, footnotes, and edits", () => {
    const source =
      '---\ntitle: very\n---\n\n😀 Cats don’t run[^id].\n\n[ref]: https://very.example "title"\n\n[^id]: Really **really** clear cats.';
    for (const text of [source, `😀\n${source}`]) {
      const result = inspect(text);
      const repeated = result.marks.find((mark) => mark.category === "repeated");
      expect(repeated?.from).toBe(text.indexOf("**really**") + 2);
      expect(repeated && text.slice(repeated.from, repeated.to)).toBe("really");
      for (const chunk of result.chunks)
        expect(chunk.positions.map((position) => text[position]).join("")).toBe(chunk.text);
    }
  });
});
