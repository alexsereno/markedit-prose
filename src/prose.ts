import type { Tree } from "@lezer/common";
import { GFM, parser } from "@lezer/markdown";
import { type Footnote, footnoteBody } from "./footnotes";
import { referenceEnd } from "./references";
import type { Chunk, Span } from "./types";

const excluded = new Set([
  "Frontmatter",
  "FrontMatter",
  "BlockMath",
  "InlineMath",
  "FencedCode",
  "CodeBlock",
  "InlineCode",
  "LinkReference",
  "Image",
  "HTMLBlock",
  "Comment",
  "CommentBlock",
  "ProcessingInstructionBlock",
  "HorizontalRule",
]);
const delimiters = new Set([
  "URL",
  "LinkTitle",
  "LinkLabel",
  "HTMLTag",
  "HeaderMark",
  "QuoteMark",
  "ListMark",
  "TaskMarker",
  "TableDelimiter",
  "Escape",
]);

const bodyParser = parser.configure(GFM);

/** Build a provenance map in the UTF-16 units shared by CodeMirror and the analyzers.
 * Use the editor's current language parser again for footnote bodies after unindenting.
 */
export function project(
  source: string,
  tree: Tree,
  proseParser: { parse(text: string): Tree } = bodyParser,
): Chunk[] {
  const cuts: (Span & { barrier: boolean; chunks?: Chunk[] })[] = [];
  const footnotes: Footnote[] = [];
  const references: Span[] = [];
  tree.iterate({
    enter(node) {
      if (node.name !== "LinkDefinition") return;
      if (source.startsWith("[^", node.from))
        footnotes.push(footnoteBody(source, node.from, node.to));
      else references.push({ from: node.from, to: node.to });
    },
  });
  for (const note of footnotes) {
    const chunks = project(note.text, proseParser.parse(note.text), proseParser).map((chunk) => ({
      text: chunk.text,
      positions: chunk.positions.map((position) => note.positions[position]),
    }));
    cuts.push({ from: note.from, to: note.to, barrier: true, chunks });
  }
  footnotes.sort((a, b) => a.from - b.from);
  const inFootnote = (from: number, to: number) => {
    let low = 0;
    let high = footnotes.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (footnotes[middle].from <= from) low = middle + 1;
      else high = middle;
    }
    return low > 0 && to <= footnotes[low - 1].to;
  };
  // MarkEdit's LinkDefinition only covers the identifier. Its supplied CommonMark
  // grammar provides the actual destination/title extent, including continued titles
  // and definitions inside quotes/lists. Parse once, only when definitions occur.
  if (references.length)
    bodyParser.parse(source).iterate({
      enter(node) {
        if (
          node.name === "LinkReference" &&
          !source.startsWith("[^", node.from) &&
          !inFootnote(node.from, node.to)
        ) {
          cuts.push({
            from: node.from,
            to: node.node.getChild("LinkTitle")
              ? node.to
              : referenceEnd(source, node.from, node.to),
            barrier: true,
          });
          return false;
        }
      },
    });
  for (const reference of references) {
    // Even an incomplete definition recognized by MarkEdit is metadata, not prose.
    const end = source.indexOf("\n", reference.to);
    cuts.push({ from: reference.from, to: end < 0 ? source.length : end, barrier: true });
  }
  tree.iterate({
    enter(node) {
      const name = node.name;
      if (inFootnote(node.from, node.to)) return false;
      if (name === "Link" && /^\[\^[^\]\r\n]+\]$/.test(source.slice(node.from, node.to))) {
        cuts.push({ from: node.from, to: node.to, barrier: false });
        return false;
      }
      if (name === "HardBreak") {
        cuts.push({ from: node.from, to: node.to - 1, barrier: false });
        return false;
      }
      if (name === "Paragraph" || name === "TableCell" || /^(ATX|Setext)Heading/.test(name))
        cuts.push({ from: node.to, to: node.to, barrier: true });
      if (excluded.has(name)) {
        cuts.push({ from: node.from, to: node.to, barrier: true });
        return false;
      }
      if (name.endsWith("Mark") || delimiters.has(name)) {
        // Escaped punctuation remains visible; only the backslash is syntax.
        cuts.push({
          from: node.from,
          to: name === "Escape" ? node.from + 1 : node.to,
          barrier: name === "HTMLTag",
        });
        return false;
      }
    },
  });
  // Cuts can overlap (the host's short label node and a complete reference span).
  // Keep them ordered; a covered cut must never move the source cursor backwards.
  cuts.sort((a, b) => a.from - b.from || b.to - a.to);
  let text = "";
  let positions: number[] = [];
  const chunks: Chunk[] = [];
  function flush() {
    if (text.trim()) chunks.push({ text, positions });
    text = "";
    positions = [];
  }
  function append(from: number, to: number) {
    for (let i = from; i < to; i++) {
      const char = source[i];
      // Bound analysis work even for a single enormous paragraph. Split at whitespace,
      // preserving every source index and never cutting an emoji or a word.
      if ((text.length >= 3000 && /\s/.test(char)) || (char === "\n" && /\n\s*$/.test(text)))
        flush();
      text += char;
      positions.push(i);
    }
  }
  let offset = 0;
  for (const cut of cuts) {
    if (cut.to < offset || (cut.from < offset && cut.to === offset)) {
      if (cut.barrier) flush();
      continue;
    }
    append(offset, Math.max(offset, cut.from));
    if (cut.barrier) flush();
    if (cut.chunks) chunks.push(...cut.chunks);
    offset = Math.max(offset, cut.to);
  }
  append(offset, source.length);
  flush();
  return chunks;
}
