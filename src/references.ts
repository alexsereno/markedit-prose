/** The host's CommonMark parser can finish a reference at the destination when
 * a title starts on the next line and continues onto another. Recognize that
 * optional title using the same quote/escape rules, without consuming prose
 * after the closing delimiter or crossing a blank line.
 */
export function referenceEnd(source: string, from: number, to: number): number {
  const lineStart = source.lastIndexOf("\n", from - 1) + 1;
  const prefix = source
    .slice(lineStart, from)
    .replace(/(?:[-+*]|\d+[.)])[ \t]+/g, (match) => " ".repeat(match.length));
  const newline = source.indexOf("\n", to);
  if (newline < 0 || source.slice(to, newline).trim()) return to;
  let start = newline + 1;
  let closing = "";
  let escaped = false;
  while (start < source.length) {
    const end = source.indexOf("\n", start);
    const lineEnd = end < 0 ? source.length : end;
    if (!source.startsWith(prefix, start)) return to;
    let position = start + prefix.length;
    if (!source.slice(position, lineEnd).trim()) return to;
    if (!closing) {
      while (source[position] === " " || source[position] === "\t") position++;
      const quote = source[position];
      if (quote !== '"' && quote !== "'" && quote !== "(") return to;
      closing = quote === "(" ? ")" : quote;
      position++;
    }
    for (; position < lineEnd; position++) {
      const char = source[position];
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === closing)
        return source.slice(position + 1, lineEnd).trim() ? to : position + 1;
    }
    // A backslash followed by a newline does not escape the next line's first character.
    escaped = false;
    start = lineEnd + 1;
  }
  return to;
}
