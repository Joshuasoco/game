import { test, expect, webkit } from "@playwright/test";
test("Safari touch events complete calibration and serve", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Play with your phone", exact: true })
    .click();
  const room = await page.locator(".room-code").textContent();
  const safari = await webkit.launch({ channel: "", args: [] });
  try {
    const context = await safari.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const phone = await context.newPage();
    const errors: string[] = [];
    phone.on("pageerror", (e) => errors.push(e.message));
    await phone.goto(`http://localhost:5173/c?room=${room}`);
    await phone
      .getByRole("button", { name: "I’d rather use touch controls" })
      .tap();
    const paddle = phone.getByRole("button", {
      name: "Swing",
      exact: true,
    });
    for (let i = 1; i <= 3; i++) {
      await expect(
        phone.getByRole("heading", { name: `Practice ${i} of 3.` }),
      ).toBeVisible();
      await paddle.tap();
    }
    await expect(
      page.getByRole("heading", { name: "Your serve.", exact: true }),
    ).toBeVisible();
    await expect(
      phone.getByRole("heading", { name: "Your serve.", exact: true }),
    ).toBeVisible();
    await paddle.tap();
    await expect(
      phone.getByRole("heading", { name: "Your serve.", exact: true }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await safari.close();
  }
});
