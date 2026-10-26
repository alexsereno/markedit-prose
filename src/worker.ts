import { analyzeText, mapMarks } from "./analyze";
import type { Mark, Request, Result } from "./types";

const cache = new Map<string, Mark[]>();
let configuration = "";
self.onmessage = (event: MessageEvent<Request>) => {
  const { id, chunks, settings } = event.data;
  try {
    const key = JSON.stringify(settings);
    if (configuration !== key) {
      cache.clear();
      configuration = key;
    }
    const marks = chunks.flatMap((chunk) => {
      let local = cache.get(chunk.text);
      if (!local) {
        local = analyzeText(chunk.text, settings);
        cache.set(chunk.text, local);
        if (cache.size > 128) cache.delete(cache.keys().next().value as string);
      }
      return mapMarks(chunk, local);
    });
    self.postMessage({ id, marks } satisfies Result);
  } catch (error) {
    self.postMessage({ id, marks: [], error: String(error) } satisfies Result);
  }
};
