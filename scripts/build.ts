import { build } from "esbuild";
import { notices } from "./notices";
import { scopeLegacyMatch } from "./vendor-patches";

const worker = await build({
  entryPoints: ["src/worker.ts"],
  plugins: [scopeLegacyMatch],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "safari16",
  minify: true,
  legalComments: "inline",
  metafile: true,
});
const licenses = await notices(worker.metafile);
await Bun.write("THIRD_PARTY_NOTICES.txt", licenses);
const main = await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "dist/markedit-prose.js",
  banner: { js: `/*! MarkEdit Prose 0.1.0 — MIT.\n${licenses.replaceAll("*/", "* /")}*/` },
  format: "cjs",
  platform: "browser",
  target: "safari16",
  minify: true,
  legalComments: "inline",
  external: ["markedit-api", "@codemirror/*", "@lezer/*"],
  define: { __WORKER_SOURCE__: JSON.stringify(worker.outputFiles[0].text) },
  metafile: true,
});
for (const meta of [worker.metafile, main.metafile]) {
  if (Object.keys(meta.inputs).some((path) => /node_modules\/(?:@codemirror|@lezer)\//.test(path)))
    throw new Error("A host editor module was accidentally bundled.");
}
console.log("Built dist/markedit-prose.js (embedded local worker; no bundled CodeMirror/Lezer).");
