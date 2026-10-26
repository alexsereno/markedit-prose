# MarkEdit Prose

Local English parts-of-speech highlighting and optional style advice for [MarkEdit](https://github.com/MarkEdit-app/MarkEdit). No server, account, subscription, or network access at runtime. The installable artifact is **`dist/markedit-prose.js`**, including its styles, dictionaries, and background worker.

## Install

Use a current MarkEdit release with the [extension API](https://github.com/MarkEdit-app/MarkEdit-api) and macOS WebKit supporting Safari 16 JavaScript features. The build targets Safari 16; this is not a claim of testing every older MarkEdit/macOS combination.

1. Download **[markedit-prose.js from the latest release](https://github.com/alexsereno/markedit-prose/releases/latest/download/markedit-prose.js)**, or build it below.
2. In Finder choose **Go → Go to Folder…**, paste:
   `~/Library/Containers/app.cyan.markedit/Data/Documents/scripts/`
3. Create the `scripts` folder if needed. Copy **only `markedit-prose.js`** into it (from `dist/` if you built it yourself).
4. Quit and reopen MarkEdit. Open **Extensions → Prose** in the menu bar.

This follows MarkEdit's [customization instructions](https://github.com/MarkEdit-app/MarkEdit/wiki/Customization). No website deployment or server setup is involved.

## Inline Predictions compatibility

**Turn off MarkEdit → Settings → Assistant → Inline Predictions before using this extension.** This is the grey suggested text that appears directly after the word you are typing. It is separate from **Suggest While Typing**, which opens a completion list.

Parts-of-speech colors and Style Check underlines use CodeMirror decorations that can split or replace the text nodes near the caret. With native inline predictions enabled, the grey suffix can appear before the typed word instead of after it (for example, `runn` + grey `ing` may display as grey `ing` + `runn`). This is a known display/positioning conflict; the extension does not intentionally modify document text. MarkEdit's supported extension API does not expose a switch for Inline Predictions, so you must disable it in MarkEdit's settings yourself.

Highlighting and underlines remain enabled on the line you are typing. There is no caret-line suppression workaround or alternative highlight renderer.

## Use

Both layers start enabled. Passive voice starts disabled. Menu checkmarks show the current choices.

| Command | Shortcut |
| --- | --- |
| Parts of Speech on/off | Control–Option–Command–P |
| Style Check on/off | Control–Option–Command–S |

Shortcuts are native menu key equivalents registered through MarkEdit, so they also appear in the menu. Change the `key` and `modifiers` values in `src/main.ts` and rebuild if they conflict with another extension or system shortcut.

**Highlight Categories** toggles nouns (red), verbs (blue), adjectives (brown), adverbs (purple), and conjunctions (green). Separate light/dark palettes follow CodeMirror's active theme. **Style Categories** toggles wordiness, unnecessary words, clichés, weakening qualifiers/adverbs, repeated words, passive voice, and custom rules. These map respectively to write-good's `tooWordy`, `so`/`thereIs`, `cliches`, `weasel`/`adverb`, `illusion`, and `passive` checks. E-Prime checking is disabled.

Dotted underlines mean suggestions, not errors. Hover to see each flagged word’s part of speech and its explanation, including overlapping checks. Multiword suggestions are labeled “Phrase.” Tooltips reuse MarkEdit’s completion-tooltip appearance and contain no action buttons. Manage allowed phrases through **Personal Exceptions…**. Nothing replaces, deletes, saves, or rewrites document text.

**Personal Exceptions…** adds/removes allowed phrases. **Custom Phrase Rules…** asks for a phrase and an explanation; selecting an existing rule removes it. Matching is literal, case-insensitive, whole-phrase matching, with flexible whitespace and equivalent straight/curly apostrophes. No regex syntax or executable rules are accepted. Exceptions suppress suggestions fully contained in the allowed phrase, including at the beginning of a document. They do not suppress parts-of-speech colors.

Preferences, rules, and exceptions are persisted beside the installed script in **`markedit-prose.settings.json`**, through MarkEdit's native file API. Updating the JavaScript keeps this file. Editor windows reload it when focused. Simultaneous settings edits in different windows use the last completed write. Saving failures produce an alert. A malformed settings file is preserved, runtime defaults are used, and the console reports the load failure; repair or remove the file before making further settings changes.

For manual configuration, quit MarkEdit, edit that JSON file, then reopen it. Example custom data (retain the other keys in your existing file):

```json
{
  "exceptions": ["very", "as well as"],
  "rules": [
    { "phrase": "at the end of the day", "reason": "consider a more specific conclusion" }
  ]
}
```

All settings are optional when supplying a new file. Omitted settings use defaults. Phrases accept up to 200 characters and rule explanations up to 500.

## Build and validation

Requires Bun 1.4.x. Development downloads packages once; the extension itself is entirely offline.

```sh
bun install --frozen-lockfile
bun run check
```

`check` runs Biome, TypeScript, focused tests, and the browser build. `bun run build` alone reproduces the single bundle from the pinned lockfile. No CodeMirror or Lezer implementation is included in the artifact: runtime editor modules come from MarkEdit, and the build rejects accidental bundling of them.

On macOS with Swift command-line tools installed:

```sh
bun run test:webkit
```

This runs the **built artifact** in an actual WKWebView using real CodeMirror and a small mock of MarkEdit's native menu/file bridge. It checks the embedded worker, decorations, toggles, persistence calls, stale-result rejection after edits, light/dark/focus styling, highlighting and underlines on the focused caret line, and the simplified menu. Native macOS predictions themselves are OS-owned and are not generated by this test. It does not install the extension into your app or replace a manual check of MarkEdit's native menus and typewriter scrolling. The harness uses local files, without a test server.

## Design and limits

- `src/prose.ts` reads MarkEdit's Markdown syntax tree after the incremental parser catches up. It omits code blocks, inline code, link destinations/titles, reference definitions, image syntax, HTML blocks/tags, and Markdown marks; visible link labels remain. Escaped visible punctuation remains prose. Actual document characters and UTF-16 positions are retained in a provenance map. Decorations split around omitted delimiters rather than crossing them.
- Fenced/indented/inline code and HTML exclusions form analysis boundaries. Paragraphs and whitespace near 3,000 characters split longer prose into analysis chunks. A single unbroken token can exceed this size. Suggestions and grammatical context do not cross chunk boundaries. Entities such as `&amp;` are analyzed as their literal source, not decoded preview text. Custom Markdown constructs depend on how MarkEdit's parser represents them.
- `src/analyze.ts` uses Compromise's explicit term offsets, not searches for matching words. write-good supplies suggestion offsets. English tagging and style rules are heuristics and sometimes disagree with a writer's intention. Compromise does not determine intent or guarantee grammatical accuracy.
- Analysis is debounced 350 ms. A local Blob worker keeps NLP work off the editing thread. Up to 128 chunks are cached per editor; edits queue only the latest pending snapshot. A generation check rejects outdated responses. Existing decorations clear immediately on edits to avoid stale advice while analysis catches up. Syntax-tree projection and decoration construction still run on the editor thread.
- Both layers use ordinary inline CodeMirror decorations. They do not intentionally change selection, caret, line layout, opacity, scroll position, focus-mode classes, or typewriter settings. Native Inline Predictions must be disabled as described above. Parent-line focus dimming naturally applies to the colored text. Native spellcheck and other extensions may add their own overlapping decorations.
- `scripts/vendor-patches.ts` scopes undeclared `match` variables in three older write-good dependencies during bundling. This fixes strict WebKit execution without altering dictionaries or installed packages. Personal exceptions are implemented independently because write-good's built-in whitelist misses position zero. Custom phrase checks use write-good's supported `checks` interface in a separate pass, preserving built-in checks.

## Update or remove

**Update:** download the JavaScript from the latest release (or run the validation/build commands), replace the same installed `markedit-prose.js`, and restart MarkEdit. Keep `markedit-prose.settings.json`. Do not install a second copy under a different name, which would register duplicate menus and layers.

**Remove:** quit MarkEdit, delete the installed `markedit-prose.js`, and reopen it. Optionally delete `markedit-prose.settings.json` to remove all preferences/exceptions. Your Markdown files are unaffected.

## References

[MarkEdit API](https://github.com/MarkEdit-app/MarkEdit-api), [Customization](https://github.com/MarkEdit-app/MarkEdit/wiki/Customization), [Compromise](https://github.com/spencermountain/compromise), and [write-good](https://github.com/btford/write-good). The editor-only colors and optional style advice are inspired by [iA Writer Syntax Highlight](https://ia.net/writer/support/editor/syntax-highlight?platform=mac) and [Style Check](https://ia.net/writer/support/editor/style-check); this is an independent extension, not an iA product.
