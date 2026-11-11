import { test, expect } from "@playwright/test";
test("play fills the viewport and settings preserve accessible controls", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Just looking? Try with your keyboard" })
    .click();
  const canvas = page.locator(".world-canvas");
  const bounds = await canvas.boundingBox();
  expect(bounds?.width).toBe(1440);
  expect(bounds?.height).toBe(1000);
  await expect(page.locator(".studio-header")).toHaveCount(0);
  await expect(page.locator(".title-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Graphics quality").selectOption("low");
  await dialog.getByLabel("Reduce motion").check();
  await expect(page.locator("html")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  await expect(
    dialog.getByLabel("Allow anonymous counters on this device"),
  ).not.toBeChecked();
  await dialog.getByLabel("Allow anonymous counters on this device").check();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A little breather." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume game" }).click();
  await page.keyboard.press("Space");
  await expect(page.locator(".scoreboard")).toBeVisible();
});
test("rival identity and touch controller survive landscape and skin changes", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page
    .getByRole("group", { name: "Rival", exact: true })
    .getByRole("radio", { name: "Mabel", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Play with your phone", exact: true })
    .click();
  const code = await page.locator(".room-code").textContent();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await context.newPage();
  await phone.goto(`http://localhost:5173/c?room=${code}`);
  await phone
    .getByRole("button", { name: "I’d rather use touch controls" })
    .click();
  for (let i = 0; i < 3; i++)
    await phone.getByRole("button", { name: "Swing" }).click();
  await expect(phone.locator(".phone-score")).toContainText("MABEL");
  await phone.getByRole("button", { name: "Settings", exact: true }).click();
  await phone
    .getByRole("button", { name: "Paddle skin 2", exact: true })
    .click();
  await expect(
    phone.getByRole("button", { name: "Paddle skin 2", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await phone.getByRole("button", { name: "Done", exact: true }).click();
  await phone.getByRole("button", { name: "Resume match" }).click();
  await phone.setViewportSize({ width: 844, height: 390 });
  const pauseBounds = await phone
    .getByRole("button", { name: "Pause match" })
    .boundingBox();
  expect(pauseBounds!.y + pauseBounds!.height).toBeLessThanOrEqual(390);
  await expect(
    phone.getByRole("button", { name: "Pause match" }),
  ).toBeVisible();
  expect(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    phone.getByText("No motion readings yet.", { exact: false }),
  ).toHaveCount(0);
  await context.close();
});

test("menu choices support keyboard navigation and all quality presets survive resize", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const modes = page.getByRole("group", { name: "Game mode", exact: true });
  const quick = modes.getByRole("radio", { name: "Quick match First to 11" });
  await quick.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    modes.getByRole("radio", { name: "Rally challenge Keep it going" }),
  ).toBeChecked();
  await page.keyboard.press("Space");
  await expect(page.locator(".title-card")).toBeVisible();
  await expect(page.locator(".title-card select")).toHaveCount(0);
  for (const quality of ["high", "low", "medium", "auto"]) {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("Graphics quality").selectOption(quality);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    if (quality !== "auto")
      await expect(page.locator("canvas")).toHaveAttribute(
        "data-quality",
        quality,
      );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const challenge = modes
    .locator("label")
    .filter({ hasText: "Rally challenge" });
  await challenge.scrollIntoViewIfNeeded();
  expect(await challenge.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
    true,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Reduce motion").check();
  await expect(page.locator("html")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  expect(errors).toEqual([]);
});
