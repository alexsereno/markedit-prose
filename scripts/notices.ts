import { readFile } from "node:fs/promises";
import type { Metafile } from "esbuild";

export async function notices(meta: Metafile): Promise<string> {
  const packages = [
    ...new Set(
      Object.keys(meta.inputs).flatMap((path) => {
        const match = path.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
        return match ? [match[1]] : [];
      }),
    ),
  ].sort();
  const sections = await Promise.all(
    packages.map(async (name) => {
      const root = `node_modules/${name}`;
      const pkg = JSON.parse(await readFile(`${root}/package.json`, "utf8"));
      let license: string;
      try {
        license = await readFile(
          `${root}/${name === "suffix-thumb" ? "LICENSE.txt" : "LICENSE"}`,
          "utf8",
        );
      } catch {
        // These two Brian Ford packages declare MIT but omit a license file.
        if (!["weasel-words", "passive-voice"].includes(name) || pkg.license !== "MIT")
          throw new Error(`Missing license for ${name}`);
        license = (await readFile("node_modules/write-good/LICENSE", "utf8")).replace(
          "2014-2019 Brian Ford",
          "Brian Ford",
        );
      }
      return `${name} ${pkg.version}\n${license.trim()}`;
    }),
  );
  return `Third-party software bundled in MarkEdit Prose\n\n${sections.join("\n\n---\n\n")}\n`;
}
