import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { linkDefinitionConfig } from "./markedit/link-definitions";
import { markdownMathExtension } from "./markedit/math";

export function markeditMarkdown() {
  return yamlFrontmatter({
    content: markdown({
      base: markdownLanguage,
      extensions: [linkDefinitionConfig, markdownMathExtension],
    }),
  });
}
export function parseMarkdown(source: string) {
  const state = EditorState.create({ doc: source, extensions: [markeditMarkdown()] });
  const tree = ensureSyntaxTree(state, state.doc.length, 1000);
  if (!tree) throw new Error("Fixture parser did not finish");
  return tree;
}

export const fixtureParser = markeditMarkdown().language.parser;
