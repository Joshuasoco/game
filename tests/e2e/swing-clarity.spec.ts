import { test, expect } from "@playwright/test";

test("Pip + Easy onboards, can skip and replay, and exposes accessible settings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Hold simulation time while inspecting a short, legal warning window.
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.addInitScript(() =>
    localStorage.setItem(
      "dink-preferences",
      JSON.stringify({ quality: "low" }),
    ),
  );
  await page.goto("/");
  await page.getByRole("radio", { name: "Easy", exact: true }).check();
  await page
    .getByRole("button", { name: "Just looking? Try with your keyboard" })
    .click();
  await expect(page.locator(".guided-practice")).toContainText(
    "Pip runs for you",
  );
  await page.getByRole("button", { name: "Skip practice" }).click();
  await expect(page.locator(".swing-status")).toHaveText("SERVE");
  await page.screenshot({ path: "artifacts/swing-clarity/laptop-serve.png" });
  await page.keyboard.press("Space");
  for (let frame = 0; frame < 400; frame++) {
    if (await page.locator(".swing-status[data-state='WAIT_BOUNCE']").count())
      break;
    await page.clock.runFor(16);
  }
  await expect(
    page.locator(".swing-status[data-state='WAIT_BOUNCE']"),
  ).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.locator(".fault-card")).toContainText(
    "First return must bounce before you hit it",
  );
  await page.keyboard.press("p");
  await page.getByRole("button", { name: "Back to clubhouse" }).click();
  await page.getByRole("button", { name: "Replay guided practice" }).click();
  await expect(page.locator(".guided-practice")).toBeVisible();
  await page.getByRole("button", { name: "Skip practice" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("checkbox", { name: "High Contrast Ring" }).check();
  await page.getByRole("checkbox", { name: "Reduce motion" }).check();
  await page.getByRole("checkbox", { name: "Swing cue sound" }).uncheck();
  await expect(page.locator("html")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("dink-clarity")!)),
    )
    .toMatchObject({ highContrast: true, swingCue: false });
  expect(errors).toEqual([]);
});

test("phone mirrors readiness and keeps its swing control tappable", async ({
  browser,
  page,
}) => {
  await page.goto("/");
  await page.getByRole("radio", { name: "Easy", exact: true }).check();
  await page.getByRole("button", { name: "Play with your phone" }).click();
  const code = await page.locator(".room-code").textContent();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await context.newPage();
  await phone.goto(`/c?room=${code}`);
  await phone
    .getByRole("button", { name: "I’d rather use touch controls" })
    .click();
  const swing = phone.getByRole("button", { name: "Swing", exact: true });
  for (let i = 0; i < 3; i++) await swing.click();
  await expect(swing).toHaveAttribute("data-readiness", "IN_REACH");
  await expect(swing).toContainText("SERVE");
  await expect(swing).toHaveCSS("background-color", "rgb(151, 232, 166)");
  await phone.screenshot({ path: "artifacts/swing-clarity/phone-serve.png" });
  await swing.click();
  await expect(swing).toHaveAttribute("data-readiness", "NO_BALL");
  await expect(swing).toBeEnabled();
  await swing.click();
  await expect(page.locator(".whiff-toast")).toHaveText("No ball to hit");
  expect(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.close();
});
