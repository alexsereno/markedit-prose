# MarkEdit-prose

English parts-of-speech highlighting and Style Check for [MarkEdit](https://github.com/MarkEdit-app/MarkEdit) that leverages [markedit-api](https://github.com/MarkEdit-app/MarkEdit-api), powered by [Compromise](https://github.com/spencermountain/compromise) and [write-good](https://github.com/btford/write-good). All analysis runs locally; your Markdown files are unchanged.

## Installation

Copy [markedit-prose.js](https://github.com/alexsereno/markedit-prose/releases/latest/download/markedit-prose.js) to `~/Library/Containers/app.cyan.markedit/Data/Documents/scripts/`, then restart MarkEdit.

> Turn off **MarkEdit > Settings > Assistant > Inline Predictions**. The extension's decorations can cause the grey predicted text to appear before the word being typed. This setting is separate from **Suggest While Typing**, which shows a completion list.

## Configuration

Open **Extensions > Prose** to configure:

- **Parts of Speech**: Toggle highlighting with `Control–Option–Command–P`.
- **Highlight Categories**: Nouns in red, verbs in blue, adjectives in brown, adverbs in purple, and conjunctions in green.
- **Style Check**: Toggle suggestion underlines with `Control–Option–Command–S`. Hover over an underline to see its part of speech and explanation.
- **Style Categories**: Wordy phrases, unnecessary words, clichés, weakening qualifiers and adverbs, repeated words, passive voice, and custom phrase rules. Passive voice is off by default.
- **Personal Exceptions…**: Add or remove phrases that Style Check should allow.
- **Custom Phrase Rules…**: Add a phrase and an explanation, or remove an existing rule.

Both features start enabled. Colors adapt to light and dark themes. Suggestions are optional editing advice; text is never changed automatically.

Settings are remembered across launches in `markedit-prose.settings.json` beside the installed script. Custom rules match whole phrases, ignoring case and allowing flexible whitespace. See the [guide](docs/guide.md) for manual configuration, matching behavior, and limitations.

To update, replace the installed JavaScript with the latest release and restart MarkEdit. Keep the settings file to preserve your preferences. To remove the extension, delete its JavaScript and restart MarkEdit; delete the settings file too if you want to remove your preferences.

## Building

Requires Bun 1.4.x.

```sh
bun install --frozen-lockfile
bun run check
```

The bundle is written to `dist/markedit-prose.js`. Copy it to MarkEdit's `scripts` folder to install your build.

`bun run check` runs lint, type-checking, tests, and the build. On macOS with Swift command-line tools, run `bun run test:webkit` to test the built bundle in WebKit.
