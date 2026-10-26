import type { Chunk, Span } from "./types";

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
