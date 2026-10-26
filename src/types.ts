export const parts = ["Noun", "Verb", "Adjective", "Adverb", "Conjunction"] as const;
export type Part = (typeof parts)[number];
export const categories = [
  "wordiness",
  "unnecessary",
  "cliches",
  "qualifiers",
  "repeated",
  "passive",
  "custom",
] as const;
export type Category = (typeof categories)[number];
export interface Settings {
  syntax: boolean;
  style: boolean;
  parts: Record<Part, boolean>;
  categories: Record<Category, boolean>;
  exceptions: string[];
  rules: { phrase: string; reason: string }[];
}
export interface Span {
  from: number;
  to: number;
}
export interface Mark extends Span {
  part?: Part;
  category?: Category;
  reason?: string;
  speech?: string;
  phrase?: string;
}
export interface Chunk {
  text: string;
  positions: number[];
}
export interface Request {
  id: number;
  chunks: Chunk[];
  settings: Settings;
}
export interface Result {
  id: number;
  marks: Mark[];
  error?: string;
}
