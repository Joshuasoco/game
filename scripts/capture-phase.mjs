/* global document, console, process */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const phase = process.argv[2] ?? "baseline";
if (!/^[a-z0-9-]+$/.test(phase)) throw Error("Use a simple phase slug.");
const dir = resolve("docs/reviews", phase);
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto("http://localhost:5173/");
  await page
    .getByRole("button", { name: "Play with your phone", exact: true })
    .waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector(".primary-button") &&
      !document.querySelector(".primary-button").disabled,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(dir, "title-1440x900.png") });
  await page
    .getByRole("button", { name: "Play with your phone", exact: true })
    .click();
  await page.locator(".qr").waitFor();
  const room = await page.locator(".room-code").textContent();
  await page.screenshot({ path: resolve(dir, "pair-1440x900.png") });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await mobile.newPage();
  await phone.goto(`http://localhost:5173/c?room=${room}`);
  await phone
    .getByRole("button", { name: "I’d rather use touch controls" })
    .click();
  for (let i = 0; i < 3; i++)
    await phone.getByRole("button", { name: "Tap to swing" }).click();
  await page
    .getByRole("heading", { name: "Your serve.", exact: true })
    .waitFor();
  await page.screenshot({ path: resolve(dir, "play-1440x900.png") });
  await phone.screenshot({ path: resolve(dir, "controller-390x844.png") });
  await writeFile(
    resolve(dir, "README.md"),
    `# ${phase}\n\nActual browser screenshots at 1440×900 (desktop) and 390×844 (phone). The prior phase directory is the before comparison. These captures do not measure real-device performance.\n`,
  );
  console.log(`Captured ${phase}`);
} finally {
  await browser.close();
}
