import type { Tree } from "@lezer/common";
import type { Chunk, Span } from "./types";

const excluded = new Set([
  "FencedCode",
  "CodeBlock",
  "InlineCode",
  "LinkReference",
  "Image",
  "HTMLBlock",
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

/** Build a provenance map in UTF-16 units, the units used by CodeMirror and both analyzers. */
export function project(source: string, tree: Tree): Chunk[] {
  const cuts: (Span & { barrier: boolean })[] = [];
  tree.iterate({
    enter(node) {
      const name = node.name;
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
    append(offset, cut.from);
    if (cut.barrier) flush();
    offset = cut.to;
  }
  append(offset, source.length);
  flush();
  return chunks;
}

/** Split marks at omitted syntax, so Markdown delimiters never acquire decorations. */
export function sourceSpans(chunk: Chunk, from: number, to: number): Span[] {
  const spans: Span[] = [];
  for (let i = from; i < to && i < chunk.positions.length; i++) {
    const position = chunk.positions[i];
    const last = spans[spans.length - 1];
    if (last && last.to === position) last.to++;
    else spans.push({ from: position, to: position + 1 });
  }
  return spans;
}
