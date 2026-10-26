# MarkEdit parser fixtures

`link-definitions.ts` and `math.ts` are copied from MarkEdit commit
`c10f8d82ed5357e199604054647092611312b555`:

- `CoreEditor/src/styling/nodes/def.ts`
- `CoreEditor/src/modules/math/index.ts`

Source: https://github.com/MarkEdit-app/MarkEdit/tree/c10f8d82ed5357e199604054647092611312b555

They retain MarkEdit's MIT license (see LICENSE). Formatting/type-only imports may
be adjusted by our formatter; parser behavior is unchanged. These fixtures run
only in tests and the WebKit test host, and are never shipped in the extension.

The test language uses MarkEdit's GFM-based markdownLanguage plus these two
configs, wrapped in CodeMirror's yamlFrontmatter, just like MarkEdit's
markdownConfigurations(). Theme-only node properties are unnecessary for parsing.
