import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Candidate } from "./art-types";
const root = resolve(import.meta.dirname, ".."),
  decisions: Record<string, { variant: number; reasons: string[] }> =
    JSON.parse(await readFile(resolve(root, "art/selections.json"), "utf8"));
for (const file of await readdir(resolve(root, "art/candidates"))) {
  if (!file.endsWith(".json")) continue;
  const path = resolve(root, "art/candidates", file);
  const c: Candidate = JSON.parse(await readFile(path, "utf8"));
  const decision = decisions[c.asset];
  if (!decision) continue;
  c.selected = c.variant === decision.variant;
  c.reason =
    decision.reasons[c.variant - 1] ?? "Not selected after comparison.";
  c.reviewer = "Codex visual curation; human approval pending";
  await writeFile(path, JSON.stringify(c, null, 2));
}
console.log(
  "Applied explicit curation decisions. Human approval remains pending.",
);
