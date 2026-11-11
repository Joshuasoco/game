import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: /controller-landscape\.spec\.ts/,
  projects: [
    {
      name: "controller-chromium",
      use: { browserName: "chromium", hasTouch: true, isMobile: true },
    },
    {
      name: "controller-webkit",
      use: {
        browserName: "webkit",
        channel: "",
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
