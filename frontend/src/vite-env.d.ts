/// <reference types="vite/client" />

declare module "node:fs" {
  export function readFileSync(path: string | URL, encoding: "utf8"): string;
}
