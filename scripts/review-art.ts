import sharp from "sharp";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Candidate } from "./art-types";
const root = resolve(import.meta.dirname, "..");
await mkdir(resolve(root, "art/reviews"), { recursive: true });
const groups = new Map<string, Candidate[]>();
for (const name of await readdir(resolve(root, "art/candidates"))) {
  if (!name.endsWith(".json")) continue;
  const c: Candidate = JSON.parse(
    await readFile(resolve(root, "art/candidates", name), "utf8"),
  );
  groups.set(c.asset, [...(groups.get(c.asset) ?? []), c]);
}
for (const [id, candidates] of groups) {
  const parts = [];
  for (const c of candidates.sort((a, b) => a.variant - b.variant)) {
    const index = c.variant - 1;
    parts.push({
      input: await sharp(resolve(root, c.file))
        .resize(480, 450, { fit: "contain", background: "#f5f1df" })
        .png()
        .toBuffer(),
      left: (index % 2) * 500 + 10,
      top: Math.floor(index / 2) * 500 + 35,
    });
    const label = Buffer.from(
      `<svg width="500" height="30"><text x="15" y="22" font-family="sans-serif" font-size="17" fill="#193f35">${id} · variant ${c.variant}</text></svg>`,
    );
    parts.push({
      input: label,
      left: (index % 2) * 500,
      top: Math.floor(index / 2) * 500,
    });
  }
  await sharp({
    create: {
      width: 1000,
      height: Math.max(1000, Math.ceil(candidates.length / 2) * 500),
      channels: 4,
      background: "#f5f1df",
    },
  })
    .composite(parts)
    .png()
    .toFile(resolve(root, `art/reviews/${id}.png`));
}
await writeFile(
  resolve(root, "art/reviews/README.md"),
  "# Curation sheets\n\nFour actual candidates per asset, labeled by variant. Raw files remain locally in ignored art/raw; exact prompts and provenance are tracked in art/candidates and the final manifest. Assistant curation is not human approval.\n",
);
console.log(`Prepared ${groups.size} review sheets.`);
