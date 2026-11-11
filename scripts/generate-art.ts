import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { ArtJob, Candidate } from "./art-types";
const root = resolve(import.meta.dirname, "..");
const jobs: ArtJob[] = JSON.parse(
  await readFile(resolve(root, "art/catalog.json"), "utf8"),
);
const only = process.argv.find((a) => a.startsWith("--asset="))?.slice(8);
const requested = jobs.filter((j) => !only || j.id === only);
if (!requested.length) throw Error("Unknown asset.");
for (const job of jobs) {
  await mkdir(resolve(root, "art/prompts"), { recursive: true });
  await writeFile(
    resolve(root, `art/prompts/${job.id}.md`),
    `# ${job.id}\n\nReference: art/selected/style-frame.png (except the initial style frame).\n\n${job.prompt}\n\nMatch docs/art-bible.md: rounded matte forms, upper-left soft key, palette of evergreen/sage/cream/clay/violet, restrained grain. Reject stray text, warped faces, extra fingers, inconsistent style. Four independent variants, explicit review before selection.\n`,
  );
}
if (process.argv.includes("--dry-run")) {
  console.log(
    JSON.stringify(
      {
        model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2.5-sunburst",
        jobs: requested.map((j) => ({
          id: j.id,
          candidates: 4,
          endpoint: j.id === "style-frame" ? "generations" : "edits",
        })),
        requires: "OPENAI_API_KEY and a selected style frame for edits",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey)
  throw Error(
    "OPENAI_API_KEY is required in the environment. No requests were made. Do not put keys in source or prompts.",
  );
const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2.5-sunburst";
if (model === "gpt-image-1")
  throw Error("gpt-image-1 is retired. Choose a supported model.");
const access = await fetch(
  `https://api.openai.com/v1/models/${encodeURIComponent(model)}`,
  { headers: { Authorization: `Bearer ${apiKey}` } },
);
if (!access.ok)
  throw Error(
    `Model access check failed (${access.status}); no images requested.`,
  );
for (const job of requested) {
  const prompt = await readFile(
    resolve(root, `art/prompts/${job.id}.md`),
    "utf8",
  );
  const params = {
    model,
    n: 4,
    size: "1024x1024",
    quality: "high",
    output_format: "png",
    background: job.transparent ? "transparent" : "opaque",
  };
  let body: string | FormData;
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  if (job.id === "style-frame") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ ...params, prompt });
  } else {
    const reference = await readFile(
      resolve(root, "art/selected/style-frame.png"),
    );
    const form = new FormData();
    for (const [key, value] of Object.entries(params))
      form.set(key, String(value));
    form.set("prompt", prompt);
    form.append(
      "image[]",
      new Blob([new Uint8Array(reference)], { type: "image/png" }),
      "style-frame.png",
    );
    body = form;
  }
  const response = await fetch(
    `https://api.openai.com/v1/images/${job.id === "style-frame" ? "generations" : "edits"}`,
    { method: "POST", headers, body, signal: AbortSignal.timeout(300000) },
  );
  if (!response.ok)
    throw Error(
      `${job.id}: image request failed (${response.status}). Check account access and billing. No response secrets logged.`,
    );
  const result = (await response.json()) as { data?: { b64_json?: string }[] };
  if (result.data?.length !== 4)
    throw Error(
      "Expected four variants. Keep existing outputs and inspect the response.",
    );
  await mkdir(resolve(root, "art/raw"), { recursive: true });
  await mkdir(resolve(root, "art/candidates"), { recursive: true });
  for (let i = 0; i < 4; i++) {
    const encoded = result.data[i].b64_json;
    if (!encoded) throw Error("Missing base64 image.");
    const bytes = Buffer.from(encoded, "base64");
    const file = `art/raw/${job.id}-api-${Date.now()}-v${i + 1}.png`;
    await writeFile(resolve(root, file), bytes);
    const candidate: Candidate = {
      asset: job.id,
      variant: i + 1,
      file,
      prompt,
      provider: "OpenAI Images API",
      model,
      params,
      date: new Date().toISOString(),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      selected: false,
      reason: "Awaiting visual curation.",
      reviewer: "unreviewed",
    };
    await writeFile(
      resolve(root, `art/candidates/${job.id}-api-v${i + 1}.json`),
      JSON.stringify(candidate, null, 2),
    );
  }
  console.log(`${job.id}: saved four candidates; no automatic selection.`);
}
