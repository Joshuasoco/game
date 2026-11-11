import sharp from "sharp";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { ArtJob, Candidate, ArtManifest } from "./art-types";
const root = resolve(import.meta.dirname, ".."),
  publicDir = resolve(root, "web/public/art");
await mkdir(publicDir, { recursive: true });
await mkdir(resolve(root, "art/selected"), { recursive: true });
const jobs: ArtJob[] = JSON.parse(
  await readFile(resolve(root, "art/catalog.json"), "utf8"),
);
const candidates: Candidate[] = [];
for (const name of await readdir(resolve(root, "art/candidates"))) {
  if (!name.endsWith(".json")) continue;
  const c: Candidate = JSON.parse(
    await readFile(resolve(root, "art/candidates", name), "utf8"),
  );
  c.sha256 = createHash("sha256")
    .update(await readFile(resolve(root, c.file)))
    .digest("hex");
  await writeFile(
    resolve(root, `art/prompts/${c.asset}-v${c.variant}.md`),
    `# ${c.asset} / variant ${c.variant}\n\n${c.prompt}\n`,
  );
  candidates.push(c);
}
const manifest: ArtManifest = {
  version: 1,
  styleReference: "art/selected/style-frame.png",
  humanApproval: "pending",
  candidates,
  assets: {},
  notes: [
    "Selection is assistant art-direction review, not a human approval.",
    "Built-in tool does not expose its underlying model; that provenance is never invented.",
    "API generation requires OPENAI_API_KEY. No API generation was run without it.",
  ],
};
const palette = [
  "193f35",
  "93ad8c",
  "f5f1df",
  "bd623f",
  "71628d",
  "52674e",
  "c5a78b",
  "d6ac87",
  "e5d48a",
  "fffdf1",
].map((h) => [
  parseInt(h.slice(0, 2), 16),
  parseInt(h.slice(2, 4), 16),
  parseInt(h.slice(4), 16),
]);
async function encode(id: string, input: Buffer, width: number, snap = false) {
  let image = sharp(input)
    .rotate()
    .resize({ width, height: width, fit: "inside", withoutEnlargement: true });
  if (snap) {
    const { data, info } = await image
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      let nearest = palette[0],
        distance = Infinity;
      for (const p of palette) {
        const d =
          (data[i] - p[0]) ** 2 +
          (data[i + 1] - p[1]) ** 2 +
          (data[i + 2] - p[2]) ** 2;
        if (d < distance) {
          nearest = p;
          distance = d;
        }
      }
      for (let j = 0; j < 3; j++)
        data[i + j] = Math.round(data[i + j] * 0.35 + nearest[j] * 0.65);
    }
    image = sharp(data, { raw: info });
  }
  const out = await image.webp({ quality: 83, alphaQuality: 100 }).toBuffer();
  await writeFile(resolve(publicDir, `${id}.webp`), out);
  const meta = await sharp(out).metadata();
  manifest.assets[id] = {
    file: `/art/${id}.webp`,
    width: meta.width!,
    height: meta.height!,
    sha256: createHash("sha256").update(out).digest("hex"),
  };
  return out;
}
for (const job of jobs) {
  const selected = candidates.find((c) => c.asset === job.id && c.selected);
  if (!selected) continue;
  const source = await readFile(resolve(root, selected.file));
  if (job.id === "style-frame")
    await sharp(source)
      .resize({ width: 1024, withoutEnlargement: true })
      .png()
      .toFile(resolve(root, "art/selected/style-frame.png"));
  const runtime = job.kind !== "reference";
  if (job.kind === "reference")
    await sharp(source)
      .resize({ width: 1024, withoutEnlargement: true })
      .png()
      .toFile(resolve(root, `art/selected/${job.id}.png`));
  if (runtime) {
    let image = sharp(source);
    if (job.transparent) image = image.trim({ threshold: 8 });
    await encode(
      job.id,
      await image.png().toBuffer(),
      job.kind === "icon" ? 128 : job.kind === "marketing" ? 960 : 512,
      job.transparent,
    );
  }
  if (job.columns && job.rows) {
    const meta = await sharp(source).metadata();
    const width = Math.floor(meta.width! / job.columns),
      height = Math.floor(meta.height! / job.rows);
    for (let y = 0; y < job.rows; y++)
      for (let x = 0; x < job.columns; x++) {
        const index = y * job.columns + x;
        const name =
          job.id === "rival-portraits"
            ? ["pip", "rocket", "mabel", "june"][index]
            : job.id === "paddle-skins"
              ? `paddle-${index + 1}`
              : job.id === "texture-atlas"
                ? ["clay", "court", "grass", "wood"][index]
                : `icon-${index + 1}`;
        let tile = sharp(
          await sharp(source)
            .extract({
              left: x * width,
              top: y * height,
              width,
              height,
            })
            .png()
            .toBuffer(),
        );
        if (job.transparent) tile = tile.trim({ threshold: 8 });
        await encode(
          name,
          await tile.png().toBuffer(),
          job.kind === "texture"
            ? 256
            : job.id === "rival-portraits"
              ? 192
              : job.id === "paddle-skins"
                ? 256
                : 128,
          job.transparent,
        );
      }
  }
  if (job.kind === "marketing") {
    const text = Buffer.from(
      '<svg width="960" height="504"><text x="42" y="210" font-family="Arial,sans-serif" font-size="45" font-weight="bold" fill="#193f35">dinkduel.</text><text x="43" y="245" font-family="Arial,sans-serif" font-size="16" fill="#193f35">Small court. Big energy.</text></svg>',
    );
    const card = await sharp(source)
      .resize({ width: 960, height: 504, fit: "cover" })
      .composite([{ input: text }])
      .png()
      .toBuffer();
    await encode("og-share", card, 960);
    await sharp(card)
      .avif({ quality: 55 })
      .toFile(resolve(publicDir, "og-share.avif"));
  }
}
const atlasJobs = Object.keys(manifest.assets).filter((k) =>
  k.startsWith("icon-"),
);
if (atlasJobs.length) {
  const tiles = await Promise.all(
    atlasJobs.map(async (id, i) => ({
      input: await sharp(resolve(publicDir, `${id}.webp`))
        .resize(64, 64, { fit: "contain", background: "#0000" })
        .png()
        .toBuffer(),
      left: (i % 4) * 64,
      top: Math.floor(i / 4) * 64,
    })),
  );
  await sharp({
    create: { width: 256, height: 128, channels: 4, background: "#0000" },
  })
    .composite(tiles)
    .webp({ lossless: true })
    .toFile(resolve(publicDir, "ui-atlas.webp"));
  manifest.assets["ui-atlas"] = {
    file: "/art/ui-atlas.webp",
    width: 256,
    height: 128,
    sha256: createHash("sha256")
      .update(await readFile(resolve(publicDir, "ui-atlas.webp")))
      .digest("hex"),
  };
}
// Report repeat-edge error rather than claiming that a generated texture tiles.
const seams: Record<string, number> = {};
for (const id of ["clay", "court", "grass", "wood"]) {
  if (!manifest.assets[id]) continue;
  const { data, info } = await sharp(resolve(publicDir, `${id}.webp`))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let error = 0;
  for (let y = 0; y < info.height; y++)
    for (let c = 0; c < 3; c++)
      error += Math.abs(
        data[y * info.width * 3 + c] -
          data[(y * info.width + info.width - 1) * 3 + c],
      );
  for (let x = 0; x < info.width; x++)
    for (let c = 0; c < 3; c++)
      error += Math.abs(
        data[x * 3 + c] - data[((info.height - 1) * info.width + x) * 3 + c],
      );
  seams[id] = Math.round(error / ((info.width + info.height) * 3));
}
await writeFile(
  resolve(root, "art/tiling-report.json"),
  JSON.stringify(
    {
      meanEdgeDifference: seams,
      acceptBelow: 24,
      note: "Lower is better; generated tiles above 24 are references only and must not repeat in the live court.",
    },
    null,
    2,
  ),
);
await writeFile(
  resolve(root, "art/manifest.json"),
  JSON.stringify(manifest, null, 2),
);
await writeFile(
  resolve(root, "web/src/art-assets.ts"),
  `// Generated by scripts/process-art.ts.\nexport const ART = ${JSON.stringify(manifest.assets, null, 2)} as const;\nexport const TILEABLE = ${JSON.stringify(Object.keys(seams).filter((k) => seams[k] < 24))} as const;\n`,
);
await writeFile(
  resolve(publicDir, "assets.css"),
  Object.keys(manifest.assets)
    .map((k) => `.art-${k}{background-image:url('/art/${k}.webp')}`)
    .join("\n"),
);
console.log(
  `Processed ${Object.keys(manifest.assets).length} production assets; raw candidates remain outside web/public.`,
);
