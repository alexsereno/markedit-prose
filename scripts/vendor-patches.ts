import { readFile } from "node:fs/promises";
import type { Plugin } from "esbuild";

/** Older write-good dependencies assign `match` without declaring it. Scope it to
 * each CommonJS module so the same code works inside a strict WebKit worker.
 * No dictionaries or suggestion logic are changed; installed packages stay intact.
 */
export const scopeLegacyMatch: Plugin = {
  name: "scope-legacy-write-good-match",
  setup(build) {
    build.onLoad(
      {
        filter: /node_modules\/(weasel-words\/weasel|passive-voice\/passive|e-prime\/e-prime)\.js$/,
      },
      async ({ path }) => {
        const contents = await readFile(path, "utf8");
        if (!contents.includes("while (match ="))
          throw new Error(`Review legacy match shim for ${path}`);
        return { contents: `var match;\n${contents}`, loader: "js" };
      },
    );
  },
};
