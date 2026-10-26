// A real CodeMirror host, with only MarkEdit's native bridge replaced for the WebKit smoke test.

import { markdown } from "@codemirror/lang-markdown";
import * as language from "@codemirror/language";
import * as stateModule from "@codemirror/state";
import * as viewModule from "@codemirror/view";
import type { MenuItem } from "markedit-api";

const global = window as unknown as Record<string, unknown>;
const extensions: stateModule.Extension[] = [];
const menus: MenuItem[] = [];
let stored: string | undefined;
global.__FILE_PATH__ = "/test/scripts/markedit-prose.js";
const host = {
  editorView: undefined as viewModule.EditorView | undefined,
  codemirror: { view: viewModule, state: stateModule, language },
  addExtension(extension: stateModule.Extension) {
    extensions.push(extension);
  },
  addMainMenuItem(item: MenuItem) {
    menus.push(item);
  },
  getFileContent: async () => stored,
  createFile: async ({ string }: { string: string }) => {
    stored = string;
    return true;
  },
  showAlert: async () => 0,
  showTextBox: async () => undefined,
  showContextMenu() {},
  getDirectoryPath: () => "/test",
};
global.MarkEdit = host;
global.require = (name: string) => {
  if (name === "markedit-api") return { MarkEdit: global.MarkEdit };
  throw new Error(name);
};
global.runSmoke = async () => {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  const source =
    "😀 Cats don’t run. Cats run quickly and cats run.\n\nvery **very** clear\n\n`very very cats`\n\n[Visible cats](https://very.example)\n\n    very very cats";
  const editor = new viewModule.EditorView({
    parent: document.body,
    state: stateModule.EditorState.create({ doc: source, extensions: [markdown(), ...extensions] }),
  });
  host.editorView = editor;
  assert(editor.dom.isConnected, "Editor was not mounted");
  await wait(1800);
  console.log("Initial worker complete");
  assert(editor.dom.querySelectorAll(".mep-Noun").length > 0, "No noun marks (worker failed?)");
  assert(editor.dom.querySelectorAll(".mep-suggestion").length > 0, "No suggestions");
  assert(editor.state.doc.toString() === source, "Document was modified");
  assert(!editor.dom.querySelector(".mep-suggestion .cm-inline-code"), "Code was marked");
  const syntax = menus[0].children?.find((item) => item.title === "Parts of Speech");
  syntax?.action?.();
  await wait(1000);
  console.log("Toggle complete");
  assert(!editor.dom.querySelector(".mep-Noun"), "Syntax master did not disable");
  assert(editor.dom.querySelector(".mep-suggestion"), "Style layer disappeared with syntax");
  assert(JSON.parse(stored ?? "{}").syntax === false, "Settings did not persist");
  const hoverPosition = source.indexOf("quickly") + 2;
  const hoverCoords = editor.coordsAtPos(hoverPosition);
  const hoverTarget = [...editor.dom.querySelectorAll(".mep-suggestion")].find(
    (element) => element.textContent === "quickly",
  );
  assert(hoverCoords && hoverTarget, "Adverb hover target missing");
  hoverTarget?.dispatchEvent(
    new MouseEvent("mousemove", {
      bubbles: true,
      clientX: (hoverCoords?.left ?? 0) + 1,
      clientY: ((hoverCoords?.top ?? 0) + (hoverCoords?.bottom ?? 0)) / 2,
    }),
  );
  for (let attempt = 0; attempt < 30 && !editor.dom.querySelector(".mep-tooltip"); attempt++)
    await wait(100);
  const explanation = editor.dom.querySelector(".mep-tooltip");
  assert(explanation, "Hover explanation did not open");
  assert(
    explanation?.querySelector("strong")?.textContent === "Adverb",
    "Tooltip should identify the part of speech with syntax off",
  );
  assert(explanation?.textContent?.includes("can weaken meaning"), "Missing explanation");
  assert(!explanation?.querySelector("button"), "Tooltip still has an action button");
  assert(!explanation?.textContent?.includes("Style suggestions"), "Old generic heading remains");
  assert(
    explanation?.closest(".cm-tooltip-hover")?.classList.contains("cm-tooltip-autocomplete"),
    "Native tooltip styling was not reused",
  );
  syntax?.action?.();
  await wait(1000);
  console.log("Toggle and tooltip checks complete");
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: "Cats run. ".repeat(5000) },
  });
  await wait(400);
  console.log("Long document submitted");
  const start = performance.now();
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: "😀 dogs run." } });
  const editMs = performance.now() - start;
  assert(!editor.dom.querySelector(".mep-Noun"), "Old marks survived an edit");
  await wait(2500);
  console.log("Edit analyzed");
  assert(editor.state.doc.toString() === "😀 dogs run.", "Stale analysis changed text");
  assert(
    [...editor.dom.querySelectorAll(".mep-Noun")].every((item) => item.textContent === "dogs"),
    "Stale results applied",
  );
  assert(editor.dom.querySelector(".mep-Noun"), "New snapshot not analyzed");
  // Simulate the exact parent-line dimming used by MarkEdit, plus its light/dark facet.
  const style = document.createElement("style");
  style.textContent = ".cm-line:not(.cm-selectedLineRange) { opacity: 0.25; }";
  document.head.append(style);
  const noun = editor.dom.querySelector(".mep-Noun") as HTMLElement;
  console.log(
    "focus opacity",
    getComputedStyle(noun.closest(".cm-line") as Element).opacity,
    noun.closest(".cm-line")?.className,
  );
  assert(
    Number(getComputedStyle(noun.closest(".cm-line") as Element).opacity) === 0.25,
    "Focus dimming overridden",
  );
  const lightColor = getComputedStyle(noun).color;
  editor.dispatch({
    effects: stateModule.StateEffect.appendConfig.of(
      viewModule.EditorView.theme({}, { dark: true }),
    ),
  });
  assert(
    getComputedStyle(editor.dom.querySelector(".mep-Noun") as Element).color !== lightColor,
    "Dark palette did not change",
  );
  // Focus and caret movement must no longer suppress either decoration layer.
  const originalHasFocus = document.hasFocus;
  document.hasFocus = () => true;
  const focusedSource = "Cats run quickly.\nDogs run really quickly.";
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: focusedSource },
    selection: { anchor: 16 },
  });
  editor.focus();
  await wait(1200);
  assert(editor.hasFocus, "Focused decoration test needs editor focus");
  const activeLine = editor.contentDOM.querySelector(".cm-line");
  assert(activeLine?.querySelector(".mep-Noun"), "Focused line lost speech highlighting");
  assert(activeLine?.querySelector(".mep-suggestion"), "Focused line lost style underlines");
  assert(editor.state.selection.main.head === 16, "Analysis moved the caret");
  editor.dispatch({ selection: { anchor: focusedSource.length } });
  const lastLine = editor.contentDOM.querySelector(".cm-line:last-child");
  assert(lastLine?.querySelector(".mep-suggestion"), "Moving the caret hid style underlines");
  assert(editor.state.doc.toString() === focusedSource, "Highlighting modified source text");
  const menuTitles = menus[0].children?.map((item) => item.title) ?? [];
  assert(
    !menuTitles.includes("Explain Suggestions at Caret…"),
    "Removed explanation command remains",
  );
  assert(!menuTitles.includes("Reload Prose Settings"), "Removed reload command remains");
  assert(
    menus[0].children?.every((item) => item.key !== "e"),
    "Removed explanation shortcut remains",
  );
  document.hasFocus = originalHasFocus;
  editor.destroy();
  return {
    ok: true,
    editMs,
    userAgent: navigator.userAgent,
    bundleWorker: true,
    persisted: true,
    staleResultsRejected: true,
    focusDimming: true,
    darkTheme: true,
    speechTooltip: true,
    nativeTooltipSurface: true,
    focusedLineDecorated: true,
    simplifiedMenu: true,
  };
};
