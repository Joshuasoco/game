/* global console, process */
import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
const dir = resolve("web/dist/assets");
let total = 0;
for (const file of await readdir(dir)) {
  if (!/\.(js|css)$/.test(file)) continue;
  total += gzipSync(await readFile(resolve(dir, file))).byteLength;
}
console.log(
  `All JS + CSS chunks, including physics: ${(total / 1000000).toFixed(3)} MB gzip (budget 2.5 MB).`,
);
if (total > 2500000) process.exitCode = 1;
