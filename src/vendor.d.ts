declare module "write-good" {
  interface Suggestion {
    index: number;
    offset: number;
    reason: string;
  }
  interface Options {
    [key: string]:
      | boolean
      | {
          [key: string]: {
            fn: (text: string) => { index: number; offset: number }[];
            explanation: string;
          };
        };
  }
  export default function writeGood(text: string, options?: Options): Suggestion[];
}
declare const __WORKER_SOURCE__: string;
