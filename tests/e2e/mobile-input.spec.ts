import { test, expect } from "@playwright/test";
test("real touch taps complete all three calibration swings", async ({
  page,
  browser,
}) => {
  await page.goto("/");
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
    .tap();
  const paddle = phone.getByRole("button", {
    name: "Swing",
    exact: true,
  });
  await expect(
    phone.getByRole("heading", { name: "Practice 1 of 3." }),
  ).toBeVisible();
  await paddle.tap();
  await expect(
    phone.getByRole("heading", { name: "Practice 2 of 3." }),
  ).toBeVisible();
  await paddle.tap();
  await expect(
    phone.getByRole("heading", { name: "Practice 3 of 3." }),
  ).toBeVisible();
  await paddle.tap();
  await expect(
    page.getByRole("heading", { name: "Your serve.", exact: true }),
  ).toBeVisible();
  await expect(
    phone.getByRole("heading", { name: "Your serve.", exact: true }),
  ).toBeVisible();
  await paddle.tap();
  await expect(page.locator(".rally-counter")).toBeVisible();
  await context.close();
});
test("touch calibration does not depend on Safari synthesizing a click", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Play with your phone", exact: true })
    .click();
  const room = await page.locator(".room-code").textContent();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await context.newPage();
  await phone.addInitScript(() => {
    document.addEventListener(
      "click",
      (e) => {
        if ((e.target as Element).closest(".paddle-button")) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true,
    );
  });
  await phone.goto(`http://localhost:5173/c?room=${room}`);
  await phone
    .getByRole("button", { name: "I’d rather use touch controls" })
    .tap();
  await phone.getByRole("button", { name: "Swing", exact: true }).tap();
  await expect(
    phone.getByRole("heading", { name: "Practice 2 of 3." }),
  ).toBeVisible();
  await context.close();
});
