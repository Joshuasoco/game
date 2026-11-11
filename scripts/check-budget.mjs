/* global console, process */
import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
let code = 0,
  total = 0;
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    const bytes = await readFile(path),
      text = /\.(js|css|html|svg|json)$/.test(entry.name);
    const transfer = text ? gzipSync(bytes).byteLength : bytes.byteLength;
    total += transfer;
    if (/\.(js|css)$/.test(entry.name)) code += transfer;
  }
}
await walk(resolve("web/dist"));
console.log(
  `All JS + CSS chunks, including physics: ${(code / 1000000).toFixed(3)} MB gzip.`,
);
console.log(
  `All bundled files, including every optional image: ${(total / 1000000).toFixed(3)} MB with text gzip (budget 2.5 MB). External Google Fonts are not included; this is a build-size check, not a network timing measurement.`,
);
if (total > 2500000) process.exitCode = 1;
