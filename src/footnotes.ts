import type { Span } from "./types";

export interface Footnote extends Span {
  text: string;
  positions: number[];
}

/** MarkEdit marks only [^id], leaving the colon/body unparsed. Unwrap the
 * definition and its indented continuation, retaining a map to the original file.
 * Its body is parsed separately: four-space prose stays prose, eight-space code
 * still becomes code, and a following ordinary paragraph is not consumed.
 */
export function footnoteBody(source: string, from: number, labelEnd: number): Footnote {
  const lineStart = source.lastIndexOf("\n", from - 1) + 1;
  const prefix = source
    .slice(lineStart, from)
    .replace(/(?:[-+*]|\d+[.)])[ \t]+/g, (match) => " ".repeat(match.length));
  const lineEnd = (start: number) => {
    const newline = source.indexOf("\n", start);
    return newline < 0 ? source.length : newline + 1;
  };
  let to = lineEnd(labelEnd);
  let bodyStart = labelEnd + (source[labelEnd] === ":" ? 1 : 0);
  if (source[bodyStart] === " " || source[bodyStart] === "\t") bodyStart++;
  const spans: Span[] = [{ from: bodyStart, to }];
  let pending: Span[] = [];
  for (let start = to; start < source.length; ) {
    const end = lineEnd(start);
    const line = source.slice(start, end);
    const withoutPrefix = line.startsWith(prefix) ? start + prefix.length : start;
    if (line.trim() === prefix.trim() || !source.slice(withoutPrefix, end).trim()) {
      pending.push({ from: end - (source[end - 1] === "\n" ? 1 : 0), to: end });
      start = end;
      continue;
    }
    if (!line.startsWith(prefix)) break;
    let content = withoutPrefix;
    let columns = 0;
    while (columns < 4 && (source[content] === " " || source[content] === "\t")) {
      columns += source[content] === "\t" ? 4 - (columns % 4) : 1;
      content++;
    }
    if (columns < 4) break;
    spans.push(...pending, { from: content, to: end });
    pending = [];
    to = end;
    start = end;
  }
  const positions = spans.flatMap((span) =>
    Array.from({ length: span.to - span.from }, (_, i) => span.from + i),
  );
  return { from, to, text: positions.map((position) => source[position]).join(""), positions };
}
