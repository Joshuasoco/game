import { test, expect } from "@playwright/test";
test("laptop and phone pair, calibrate, serve, pause and reconnect", async ({
  browser,
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Play with your phone" }).click();
  const code = await page.locator(".room-code").textContent();
  expect(code).toMatch(/^[A-Z]{4}$/);
  const phoneContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await phoneContext.newPage();
  await phone.goto(`/c?room=${code}`);
  await phone
    .getByRole("button", { name: "I’d rather use touch controls" })
    .click();
  for (let i = 0; i < 3; i++)
    await phone.getByRole("button", { name: "Swing" }).click();
  await expect(
    page.getByRole("heading", { name: "Your serve." }),
  ).toBeVisible();
  await expect(
    phone.getByRole("heading", { name: "Your serve." }),
  ).toBeVisible();
  await phone.getByRole("button", { name: "Swing" }).click();
  await expect(page.locator(".debug")).toHaveCount(0);
  await expect(page.locator(".scoreboard")).toBeVisible();
  await phone.getByRole("button", { name: "Pause match" }).click();
  await expect(
    page.getByRole("heading", { name: "A little breather." }),
  ).toBeVisible();
  await phone.getByRole("button", { name: "Resume match" }).click();
  await expect(
    page.getByRole("heading", { name: "A little breather." }),
  ).toHaveCount(0);
  await phone.reload();
  await expect(
    phone.getByRole("button", { name: "I’d rather use touch controls" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A little breather." }),
  ).toBeVisible();
  const scoreBefore = await page.locator(".scoreboard").innerText();
  await phone
    .getByRole("button", { name: "I’d rather use touch controls" })
    .click();
  for (let i = 0; i < 3; i++)
    await phone.getByRole("button", { name: "Swing" }).click();
  await expect(
    page.getByRole("heading", { name: "A little breather." }),
  ).toHaveCount(0);
  expect(await page.locator(".scoreboard").innerText()).toBe(scoreBefore);
  expect(errors).toEqual([]);
  await phoneContext.close();
});
test("keyboard match and narrow layout remain usable", async ({ page }) => {
  await page.goto("/?debug=1");
  await page
    .getByRole("button", { name: "Just looking? Try with your keyboard" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your serve." }),
  ).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.locator(".debug")).toContainText("phase rally");
  await page.keyboard.press("p");
  await expect(
    page.getByRole("heading", { name: "A little breather." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to clubhouse" }).first().click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Small court. Big energy." }),
  ).toBeVisible();
});
