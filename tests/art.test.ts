import { it, expect } from "vitest";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import manifest from "../art/manifest.json";
import catalog from "../art/catalog.json";
it("records four or more candidates and one explicit selection per art job", () => {
  for (const job of catalog) {
    const choices = manifest.candidates.filter((c) => c.asset === job.id);
    expect(choices.length).toBeGreaterThanOrEqual(4);
    expect(choices.filter((c) => c.selected)).toHaveLength(1);
    for (const c of choices) {
      expect(c.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(c.prompt.length).toBeGreaterThan(100);
      expect(c.reason).not.toBe("Awaiting visual curation.");
    }
    if (job.id !== "style-frame")
      for (const c of choices) expect(c.params).toHaveProperty("reference");
  }
  expect(manifest.humanApproval).toBe("pending");
});
it("ships downsized hashed images and preserves portrait alpha", async () => {
  for (const [id, asset] of Object.entries(manifest.assets)) {
    const bytes = await readFile(resolve("web/public", asset.file.slice(1)));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
    const meta = await sharp(bytes).metadata();
    expect(meta.width).toBeLessThanOrEqual(960);
    expect(meta.height).toBeLessThanOrEqual(960);
    if (["pip", "rocket", "mabel", "june", "app-icon"].includes(id))
      expect(meta.hasAlpha).toBe(true);
  }
});
it("keeps selected source images so processing works from a fresh checkout", async () => {
  for (const c of manifest.candidates.filter((c) => c.selected)) {
    const source = await readFile(
      resolve("art/selected/sources", `${c.asset}.png`),
    );
    expect(createHash("sha256").update(source).digest("hex")).toBe(c.sha256);
  }
});
