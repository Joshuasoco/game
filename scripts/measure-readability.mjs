/* global console, document, window, localStorage, navigator, KeyboardEvent, requestAnimationFrame, setInterval, clearInterval */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Use the available GPU: software-rendering flags would invalidate a laptop check.
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      "dink-preferences",
      JSON.stringify({
        quality: "medium",
        reducedMotion: false,
        analytics: false,
      }),
    ),
  );
  await page.goto("http://localhost:5173/?debug");
  await page
    .getByRole("button", { name: "Just looking? Try with your keyboard" })
    .click();
  const skip = page.getByRole("button", { name: /skip/i });
  if (await skip.count()) await skip.first().click();
  await page.waitForTimeout(4000);
  const result = await page.evaluate(async () => {
    const canvas = document.querySelector("canvas");
    const gl = canvas.getContext("webgl2");
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = gl.getParameter(
      extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
    );
    const intervals = [];
    const phaseFrames = {};
    let start;
    let previous;
    let finish;
    // Exercise real gameplay throughout the sample, including serves and point transitions.
    const input = setInterval(() => {
      for (const code of ["Space", "Enter"]) {
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            code,
            key: code === "Space" ? " " : code,
            bubbles: true,
          }),
        );
        window.dispatchEvent(
          new KeyboardEvent("keyup", { code, bubbles: true }),
        );
      }
    }, 180);
    try {
      await new Promise((resolveFrame) => {
        const frame = (time) => {
          if (start === undefined) start = time;
          if (previous !== undefined) {
            intervals.push(time - previous);
            const phase =
              document
                .querySelector(".debug")
                ?.textContent.match(/phase (\w+)/)?.[1] ?? "unknown";
            phaseFrames[phase] = (phaseFrames[phase] ?? 0) + 1;
          }
          previous = time;
          finish = time;
          if (time - start < 10000) requestAnimationFrame(frame);
          else resolveFrame();
        };
        requestAnimationFrame(frame);
      });
    } finally {
      clearInterval(input);
    }
    const sorted = [...intervals].sort((a, b) => a - b);
    return {
      gpu,
      hardwareConcurrency: navigator.hardwareConcurrency,
      userAgent: navigator.userAgent,
      viewport: [1440, 900],
      quality: canvas.dataset.quality,
      frames: intervals.length,
      elapsedMs: finish - start,
      averageFps: (intervals.length * 1000) / (finish - start),
      p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
      framesOver33ms: intervals.filter((time) => time > 33.34).length,
      phaseFrames,
      method:
        "Raw requestAnimationFrame intervals during scripted keyboard gameplay; 4s warmup, 10s sample; Vite development server.",
      laptopClassification:
        "Unverified: the browser exposes the GPU and logical CPU count, not the laptop model or power profile.",
    };
  });
  const directory = resolve("docs/reviews/readability");
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, "performance.json"),
    JSON.stringify(
      { measuredAt: new Date().toISOString(), ...result },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
