import { mkdir } from "node:fs/promises";
import { build } from "esbuild";

await mkdir(".test-output", { recursive: true });
await build({
  entryPoints: ["tests/host.ts"],
  bundle: true,
  outfile: ".test-output/host.js",
  format: "iife",
  platform: "browser",
  target: "safari16",
});
await Bun.write(
  ".test-output/smoke.html",
  `<!doctype html><meta charset="utf-8"><body><script>console.log = console.error = console.warn = (...args) => window.webkit.messageHandlers.log.postMessage(args.map(String).join(" ")); window.onerror = (message) => window.webkit.messageHandlers.result.postMessage(String(message));</script><script src="host.js"></script><script src="../dist/markedit-prose.js"></script><script>runSmoke().then(result => window.webkit.messageHandlers.result.postMessage(JSON.stringify(result))).catch(error => window.webkit.messageHandlers.result.postMessage(String(error) + "\\n" + String(error.stack || "")));</script>`,
);
const process = Bun.spawn(
  ["swift", "scripts/webkit-smoke.swift", `${import.meta.dir}/../.test-output/smoke.html`],
  { stdout: "inherit", stderr: "inherit" },
);
if ((await process.exited) !== 0) throw new Error("WebKit smoke test failed");
