import type { DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";
import { MarkEdit, type MenuItem } from "markedit-api";
import { project } from "./prose";
import { Revision } from "./revision";
import { defaults, parseSettings } from "./settings";
import { categories, type Mark, parts, type Result, type Settings } from "./types";

const { EditorView: View, ViewPlugin, Decoration, hoverTooltip } = MarkEdit.codemirror.view;
const { StateEffect } = MarkEdit.codemirror.state;
const { ensureSyntaxTree, language } = MarkEdit.codemirror.language;
const refresh = StateEffect.define<null>();
const results = StateEffect.define<Mark[]>();
let settings = defaults();
const editors = new Set<EditorView>();
const filePath =
  typeof __FILE_PATH__ === "string"
    ? __FILE_PATH__.replace(/[^/]+$/, "markedit-prose.settings.json")
    : `${MarkEdit.getDirectoryPath("documents")}/scripts/markedit-prose.settings.json`;

async function load() {
  try {
    const json = await MarkEdit.getFileContent(filePath);
    if (json !== undefined) {
      const next = parseSettings(json);
      if (JSON.stringify(settings) !== JSON.stringify(next)) {
        settings = next;
        notify();
      }
    }
  } catch (error) {
    console.warn("MarkEdit Prose: could not load settings", error);
  }
}
function notify() {
  for (const editor of editors) editor.dispatch({ effects: refresh.of(null) });
}
let saves = Promise.resolve();
function change(edit: (value: Settings) => void) {
  saves = saves
    .then(async () => {
      const json = await MarkEdit.getFileContent(filePath);
      const next = json === undefined ? structuredClone(settings) : parseSettings(json);
      edit(next);
      if (
        !(await MarkEdit.createFile({
          path: filePath,
          string: `${JSON.stringify(next, null, 2)}\n`,
          overwrites: true,
        }))
      )
        throw new Error("The settings file could not be saved.");
      settings = next;
      notify();
    })
    .catch(async (error) => {
      await MarkEdit.showAlert({
        title: "Prose settings could not be saved",
        message: String(error),
      });
    });
}

class ProseView {
  decorations: DecorationSet = Decoration.none;
  marks: Mark[] = [];
  private revision = new Revision();
  private timer?: ReturnType<typeof setTimeout>;
  private worker?: Worker;
  private busy = false;
  private pending = false;
  private destroyed = false;
  constructor(readonly view: EditorView) {
    editors.add(view);
    this.schedule();
  }
  update(update: ViewUpdate) {
    if (
      update.docChanged ||
      update.transactions.some((tr) => tr.effects.some((effect) => effect.is(refresh)))
    ) {
      this.revision.next();
      this.decorations = Decoration.none;
      this.marks = [];
      this.schedule();
    }
    let render =
      update.docChanged ||
      update.transactions.some((tr) => tr.effects.some((effect) => effect.is(refresh)));
    for (const transaction of update.transactions)
      for (const effect of transaction.effects) {
        if (effect.is(results)) {
          this.marks = effect.value;
          render = true;
        }
      }
    if (render) this.render();
  }
  private render() {
    this.decorations = Decoration.set(
      this.marks.map((mark) =>
        Decoration.mark({
          class: mark.part ? `mep-${mark.part}` : "mep-suggestion",
        }).range(mark.from, mark.to),
      ),
      true,
    );
  }

  private schedule() {
    clearTimeout(this.timer);
    this.pending = true;
    this.timer = setTimeout(() => this.run(), 350);
  }
  private run() {
    if (this.destroyed || this.busy) return;
    this.pending = false;
    if (!settings.syntax && !settings.style) return;
    const state = this.view.state;
    // Allow MarkEdit's incremental parser time to catch up, without a long synchronous parse.
    const tree = ensureSyntaxTree(state, state.doc.length, 15);
    if (!tree) {
      this.schedule();
      return;
    }
    try {
      if (!this.worker) {
        const url = URL.createObjectURL(new Blob([__WORKER_SOURCE__], { type: "text/javascript" }));
        try {
          this.worker = new Worker(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        this.worker.onmessage = (event: MessageEvent<Result>) => {
          this.busy = false;
          if (this.destroyed) return;
          if (event.data.error) console.error("MarkEdit Prose analysis failed:", event.data.error);
          else if (this.revision.accepts(event.data.id))
            this.view.dispatch({ effects: results.of(event.data.marks) });
          if (this.pending) this.schedule();
        };
        this.worker.onerror = (event) => {
          console.error("MarkEdit Prose worker failed:", event.message);
          this.worker?.terminate();
          this.worker = undefined;
          this.busy = false;
          this.view.dispatch({ effects: results.of([]) });
        };
      }
      const chunks = project(state.doc.toString(), tree, state.facet(language)?.parser);
      this.busy = true;
      this.worker.postMessage({ id: this.revision.next(), chunks, settings });
    } catch (error) {
      this.busy = false;
      console.error("MarkEdit Prose:", error);
    }
  }
  destroy() {
    this.destroyed = true;
    this.revision.next();
    clearTimeout(this.timer);
    this.worker?.terminate();
    editors.delete(this.view);
  }
}
const plugin = ViewPlugin.fromClass(ProseView, { decorations: (instance) => instance.decorations });
const tooltip = hoverTooltip(
  (view, position) => {
    const matches =
      view
        .plugin(plugin)
        ?.marks.filter((mark) => mark.reason && mark.from <= position && mark.to > position) ?? [];
    if (!matches.length) return null;
    const unique = [
      ...new Map(matches.map((mark) => [`${mark.category}:${mark.reason}`, mark])).values(),
    ];
    return {
      pos: Math.min(...matches.map((mark) => mark.from)),
      end: Math.max(...matches.map((mark) => mark.to)),
      above: true,
      create() {
        const dom = document.createElement("div");
        dom.className = "mep-tooltip";
        for (const mark of unique) {
          const entry = document.createElement("div");
          entry.className = "mep-tooltip-entry";
          const title = document.createElement("strong");
          title.textContent = mark.speech ?? "Word";
          const reason = document.createElement("div");
          reason.textContent = mark.reason ?? "";
          entry.append(title, reason);
          dom.append(entry);
        }
        let shell: Element | null = null;
        return {
          dom,
          mount() {
            // Reuse MarkEdit's completion-tooltip surface and font styles, including
            // its current theme colors, rounded corners, blur, and shadow.
            shell = dom.closest(".cm-tooltip-hover");
            shell?.classList.add("cm-tooltip-autocomplete", "mep-tooltip-shell");
          },
          destroy() {
            if (!shell?.querySelector(".mep-tooltip"))
              shell?.classList.remove("cm-tooltip-autocomplete", "mep-tooltip-shell");
          },
        };
      },
    };
  },
  { hoverTime: 400 },
);

const light = {
  Noun: "#b22d47",
  Verb: "#2465b0",
  Adjective: "#946116",
  Adverb: "#8251aa",
  Conjunction: "#287446",
};
const dark = {
  Noun: "#fa92a5",
  Verb: "#87baff",
  Adjective: "#e4bc79",
  Adverb: "#c7a2ee",
  Conjunction: "#88c99b",
};
const theme = View.baseTheme({
  ...Object.fromEntries(
    parts.flatMap((part) => [
      [`&light .mep-${part}`, { color: light[part] }],
      [`&dark .mep-${part}`, { color: dark[part] }],
    ]),
  ),
  ".mep-suggestion": {
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
    textDecorationColor: "#9a824f",
    textUnderlineOffset: "3px",
    textDecorationThickness: "1px",
  },
  ".cm-tooltip.mep-tooltip-shell": { maxWidth: "360px" },
  ".mep-tooltip": { padding: "8px", lineHeight: "1.2" },
  ".mep-tooltip-entry + .mep-tooltip-entry": { marginTop: "8px" },
  ".mep-tooltip-entry strong": { display: "block", fontWeight: "500", marginBottom: "4px" },
});
MarkEdit.addExtension([plugin, tooltip, theme]);

function toggle(title: string, read: () => boolean, edit: (value: Settings) => void): MenuItem {
  return { title, state: () => ({ isSelected: read() }), action: () => change(edit) };
}
async function addException() {
  const phrase = await MarkEdit.showTextBox({
    title: "Always allow a phrase",
    placeholder: "Case-insensitive, whole phrase",
  });
  if (phrase?.trim())
    change((value) => {
      value.exceptions.push(phrase.trim());
      parseSettings(JSON.stringify(value));
    });
}
async function manageExceptions() {
  MarkEdit.showContextMenu([
    {
      title: "Add exception…",
      action: () => {
        void addException();
      },
    },
    ...settings.exceptions.map((phrase) => ({
      title: `Remove “${phrase}”`,
      action: () =>
        change((value) => {
          value.exceptions = value.exceptions.filter((item) => item !== phrase);
        }),
    })),
  ]);
}
async function addRule() {
  const phrase = await MarkEdit.showTextBox({
    title: "Custom phrase to flag",
    placeholder: "For example: at the end of the day",
  });
  if (!phrase?.trim()) return;
  const reason = await MarkEdit.showTextBox({
    title: "Suggestion explanation",
    placeholder: "For example: consider a more specific phrase",
  });
  if (reason?.trim())
    change((value) => {
      value.rules.push({ phrase: phrase.trim(), reason: reason.trim() });
      parseSettings(JSON.stringify(value));
    });
}
function manageRules() {
  MarkEdit.showContextMenu([
    {
      title: "Add phrase rule…",
      action: () => {
        void addRule();
      },
    },
    ...settings.rules.map((rule) => ({
      title: `Remove “${rule.phrase}”`,
      action: () =>
        change((value) => {
          value.rules = value.rules.filter((item) => item.phrase !== rule.phrase);
        }),
    })),
  ]);
}
const labels = {
  wordiness: "Wordy phrases",
  unnecessary: "Unnecessary words",
  cliches: "Clichés",
  qualifiers: "Weakening qualifiers and adverbs",
  repeated: "Repeated words",
  passive: "Passive voice",
  custom: "Custom phrase rules",
};
MarkEdit.addMainMenuItem({
  title: "Prose",
  children: [
    {
      ...toggle(
        "Parts of Speech",
        () => settings.syntax,
        (value) => {
          value.syntax = !value.syntax;
        },
      ),
      key: "p",
      modifiers: ["Control", "Option", "Command"],
    },
    {
      title: "Highlight Categories",
      children: parts.map((part) =>
        toggle(
          part,
          () => settings.parts[part],
          (value) => {
            value.parts[part] = !value.parts[part];
          },
        ),
      ),
    },
    { separator: true },
    {
      ...toggle(
        "Style Check",
        () => settings.style,
        (value) => {
          value.style = !value.style;
        },
      ),
      key: "s",
      modifiers: ["Control", "Option", "Command"],
    },
    {
      title: "Style Categories",
      children: categories.map((category) =>
        toggle(
          labels[category],
          () => settings.categories[category],
          (value) => {
            value.categories[category] = !value.categories[category];
          },
        ),
      ),
    },
    {
      title: "Personal Exceptions…",
      action: () => {
        void manageExceptions();
      },
    },
    { title: "Custom Phrase Rules…", action: manageRules },
  ],
});
void load();
window.addEventListener("focus", () => {
  void load();
});
