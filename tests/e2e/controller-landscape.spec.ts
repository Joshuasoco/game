import { test, expect, type Page } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import { createApp } from "../../server/src/index";
import type { AddressInfo } from "node:net";
let relay: ReturnType<typeof createApp>;
import type {
  ClientEvents,
  ServerEvents,
  GamePhase,
  Pose,
  Swing,
} from "@dink/shared";
let host: Socket<ServerEvents, ClientEvents>;
let room: string,
  state: GamePhase,
  poses: Pose[],
  swings: Swing[],
  calibrations: number,
  latency: number;
test.beforeEach(async ({ page }) => {
  const previousOrigins = process.env.ALLOWED_ORIGINS;
  process.env.ALLOWED_ORIGINS = "http://localhost:5173";
  relay = createApp();
  if (previousOrigins === undefined) delete process.env.ALLOWED_ORIGINS;
  else process.env.ALLOWED_ORIGINS = previousOrigins;
  await new Promise<void>((resolve) =>
    relay.http.listen(0, "127.0.0.1", resolve),
  );
  const port = (relay.http.address() as AddressInfo).port;
  // Give every test a private real relay, preserving browser network/offline semantics.
  await page.addInitScript((port) => {
    const NativeSocket = window.WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        const endpoint = new URL(url);
        if (endpoint.pathname.startsWith("/socket.io/"))
          endpoint.host = `127.0.0.1:${port}`;
        super(endpoint, protocols);
      }
    };
  }, port);
  poses = [];
  swings = [];
  calibrations = 0;
  latency = 0;
  state = {
    phase: "calibrate",
    score: [1, 1],
    rally: 0,
    serving: "player",
    message: "Three gentle swings.",
  };
  host = io(`http://127.0.0.1:${port}`, {
    transports: ["websocket"],
    forceNew: true,
  });
  await new Promise<void>((resolve, reject) => {
    host.on("connect", resolve);
    host.on("connect_error", reject);
  });
  room = await new Promise<string>((resolve) =>
    host.emit("host:create", (value) => resolve(value.roomCode)),
  );
  host.on("input:pose", (p) => poses.push(p));
  host.on("input:swing", (s) => swings.push(s));
  host.on("input:calibration", () => {
    calibrations++;
    publish("serve");
  });
  host.on("input:pause", () =>
    publish(state.phase === "paused" ? "serve" : "paused"),
  );
  host.on("net:ping", (p, ack) =>
    setTimeout(() => ack({ tPhone: p.tPhone, tHost: Date.now() }), latency),
  );
  host.emit("game:phase", state);
});
test.afterEach(async () => {
  host?.disconnect();
  await new Promise<void>((resolve) => relay.io.close(() => resolve()));
});
function publish(phase: GamePhase["phase"], message = "") {
  state = { ...state, phase, message };
  host.emit("game:phase", state);
}
async function ready(page: Page, width = 844, height = 390) {
  await page.setViewportSize({ width, height });
  await page.goto(`/c?room=${room}`);
  await page
    .getByRole("button", { name: "I’d rather use touch controls" })
    .click();
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Swing", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your serve." }),
  ).toBeVisible();
}
test("two primary controls in both orientations, >=64px targets, screenshots and handedness", async ({
  page,
}, info) => {
  await ready(page);
  await expect(page.locator(".phone-connection")).toContainText("ms");
  for (const [width, height] of [
    [844, 390],
    [390, 844],
    [667, 320],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".thumb-controls button")).toHaveCount(1);
    await expect(page.getByRole("slider", { name: "Aim" })).toBeVisible();
    await expect(page.locator(".phone-header button")).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: /Advance|Retreat|DROP/ }),
    ).toHaveCount(0);
    for (const target of await page
      .locator(".phone-header button, .thumb-controls button, .relative-aim")
      .all()) {
      const b = (await target.boundingBox())!;
      expect(b.width).toBeGreaterThanOrEqual(64);
      expect(b.height).toBeGreaterThanOrEqual(64);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height).toBeLessThanOrEqual(height);
      expect(b.x + b.width).toBeLessThanOrEqual(width);
    }
    const swing = (await page
      .getByRole("button", { name: "Swing", exact: true })
      .boundingBox())!;
    expect(swing.width).toBeGreaterThanOrEqual(112);
    expect(swing.height).toBeGreaterThanOrEqual(112);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width !== 667)
      await page.screenshot({
        path: `artifacts/controller-two-thumb/after-${width}x${height}-${info.project.name || "chromium"}.png`,
      });
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Controller settings" });
  await sheet.getByRole("button", { name: "Left", exact: true }).click();
  await sheet.getByRole("switch", { name: "Haptics" }).click();
  await expect(sheet.getByRole("switch", { name: "Haptics" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".thumb-controls")).toHaveCount(0);
  await page.getByRole("button", { name: "Resume match" }).click();
  for (const [width, height] of [
    [844, 390],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    const aim = (await page
      .getByRole("slider", { name: "Aim" })
      .boundingBox())!;
    const swing = (await page
      .getByRole("button", { name: "Swing", exact: true })
      .boundingBox())!;
    expect(swing.x).toBeLessThan(aim.x);
  }
});
test("charge, swipe-up lob, direct touch release, relative aim and independent fingers", async ({
  page,
}) => {
  await ready(page);
  const aim = page.getByRole("slider", { name: "Aim" }),
    swing = page.getByRole("button", { name: "Swing", exact: true });
  await aim.dispatchEvent("pointerdown", { pointerId: 10, clientX: 100 });
  await aim.dispatchEvent("pointermove", { pointerId: 10, clientX: 180 });
  await expect.poll(() => poses.at(-1)?.roll ?? 0).toBeGreaterThan(0);
  await swing.dispatchEvent("pointerdown", {
    pointerId: 20,
    pointerType: "touch",
    isPrimary: false,
    clientX: 600,
    clientY: 240,
  });
  await expect(swing).toHaveAttribute("data-pressed", "true");
  await swing.dispatchEvent("pointermove", {
    pointerId: 20,
    clientX: 605,
    clientY: 180,
  });
  await page.waitForTimeout(720);
  await swing.dispatchEvent("pointerup", {
    pointerId: 20,
    pointerType: "touch",
    clientX: 605,
    clientY: 180,
  });
  await expect.poll(() => swings.length).toBe(1);
  expect(swings[0]).toMatchObject({ power: 1, lob: true, assisted: true });
  expect(swings[0].tilt).toBeGreaterThan(0);
  await swing.dispatchEvent("click");
  expect(swings).toHaveLength(1);
  await aim.dispatchEvent("pointerup", { pointerId: 10 });
  await expect.poll(() => poses.at(-1)?.roll).toBe(0);
  await swing.click();
  await expect.poll(() => swings.length).toBe(2);
  expect(swings[1]).toMatchObject({ power: 0.55, lob: false });
  await swing.dispatchEvent("pointerdown", {
    pointerId: 25,
    clientX: 600,
    clientY: 240,
  });
  await swing.dispatchEvent("pointercancel", { pointerId: 25 });
  await swing.dispatchEvent("pointerup", { pointerId: 25 });
  expect(swings).toHaveLength(2);
});
test("pause hides controls; portrait remains playable; transport reconnect restores session", async ({
  page,
  context,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "Pause match" }).click();
  await expect(page.locator(".thumb-controls")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Resume match" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to clubhouse" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Resume match" }).click();
  await page.getByRole("button", { name: "Swing", exact: true }).click();
  await expect.poll(() => swings.length).toBe(1);
  await context.setOffline(true);
  await expect(page.locator(".phone-connection")).toContainText("Reconnecting");
  await context.setOffline(false);
  await expect.poll(() => calibrations, { timeout: 15000 }).toBeGreaterThan(1);
  await expect(page.locator(".status-dot")).not.toHaveClass(/offline/);
});
test("motion denial retains touch fallback", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.addInitScript(() => {
    Object.defineProperty(window.DeviceMotionEvent, "requestPermission", {
      value: async () => "denied",
    });
    Object.defineProperty(window.DeviceOrientationEvent, "requestPermission", {
      value: async () => "denied",
    });
  });
  await page.goto(`/c?room=${room}`);
  await page.getByRole("button", { name: "Tap to enable motion" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Motion permission was not granted",
  );
  await page
    .getByRole("button", { name: "I’d rather use touch controls" })
    .click();
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Swing", exact: true }).click();
  await expect.poll(() => calibrations).toBe(1);
});
test("motion hides Aim, calibrates and sends swings in either orientation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.addInitScript(() => {
    Object.defineProperty(window.DeviceMotionEvent, "requestPermission", {
      value: async () => "granted",
    });
    Object.defineProperty(window.DeviceOrientationEvent, "requestPermission", {
      value: async () => "granted",
    });
  });
  await page.goto(`/c?room=${room}`);
  await page.getByRole("button", { name: "Tap to enable motion" }).click();
  const swing = () =>
    page.evaluate(() => {
      window.dispatchEvent(
        Object.assign(new Event("deviceorientation"), {
          beta: 70,
          gamma: 10,
        }),
      );
      for (const alpha of [700, 100])
        window.dispatchEvent(
          Object.assign(new Event("devicemotion"), {
            rotationRate: { alpha, beta: 0, gamma: 0 },
          }),
        );
    });
  for (let i = 0; i < 3; i++) {
    if (i) await page.waitForTimeout(320);
    await swing();
  }
  await expect.poll(() => calibrations).toBe(1);
  await expect(page.getByRole("slider", { name: "Aim" })).toHaveCount(0);
  await page.evaluate(() =>
    window.dispatchEvent(
      Object.assign(new Event("deviceorientation"), { beta: 85, gamma: 18 }),
    ),
  );
  await expect
    .poll(() => page.locator(".paddle-art").getAttribute("style"))
    .toContain("rotateX");
  await page.waitForTimeout(320);
  await swing();
  await expect.poll(() => swings.length).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Swing", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("slider", { name: "Aim" })).toHaveCount(0);
});
test("existing haptic patterns, perfect-ring feedback, haptics switch and latency warning", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const patterns: number[][] = [];
    Object.defineProperty(window, "testHaptics", { value: patterns });
    Object.defineProperty(navigator, "vibrate", {
      value: (p: number[]) => {
        patterns.push(p);
        return true;
      },
    });
  });
  await ready(page);
  for (const pattern of [[22], [12, 18, 25], [65], [20, 35, 20]]) {
    host.emit("haptic", { pattern });
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as Window & { testHaptics: number[][] }
          ).testHaptics.at(-1),
        ),
      )
      .toEqual(pattern);
    if (pattern[0] === 12)
      await expect(page.locator(".phone-app")).toHaveClass(/feedback-perfect/);
  }
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("switch", { name: "Haptics" }).click();
  const count = await page.evaluate(
    () =>
      (window as unknown as Window & { testHaptics: number[][] }).testHaptics
        .length,
  );
  host.emit("haptic", { pattern: [22] });
  await expect(page.getByText("Hit!", { exact: true })).toHaveCount(0); // Play surface stays hidden while paused.
  expect(
    await page.evaluate(
      () =>
        (window as unknown as Window & { testHaptics: number[][] }).testHaptics
          .length,
    ),
  ).toBe(count);
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Resume match" }).click();
  latency = 220;
  await expect(page.locator(".phone-connection")).toHaveClass(/high-latency/, {
    timeout: 8000,
  });
  await expect(
    page.getByText("High latency · check your connection"),
  ).toBeVisible();
});
test("wake lock reacquires after foregrounding with graceful feature fallback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let count = 0;
    const locks: (EventTarget & { release: () => Promise<void> })[] = [];
    Object.defineProperty(navigator, "wakeLock", {
      value: {
        request: async () => {
          count++;
          const sentinel = Object.assign(new EventTarget(), {
            release: async () => {
              sentinel.dispatchEvent(new Event("release"));
            },
          });
          locks.push(sentinel);
          return sentinel;
        },
      },
    });
    Object.defineProperty(window, "testWake", {
      value: {
        get count() {
          return count;
        },
        locks,
      },
    });
  });
  await ready(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as Window & { testWake: { count: number } })
            .testWake.count,
      ),
    )
    .toBe(1);
  await page.evaluate(async () => {
    const value = (
      window as unknown as Window & {
        testWake: { locks: { release: () => Promise<void> }[] };
      }
    ).testWake;
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await value.locks[0].release();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as Window & { testWake: { count: number } })
            .testWake.count,
      ),
    )
    .toBe(2);
});
test("manifest and install assets remain available", async ({ request }) => {
  const manifest = await (await request.get("/controller.webmanifest")).json();
  expect(manifest).toMatchObject({
    display: "standalone",
    start_url: "/controller.html",
  });
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  expect(
    (await request.get("/controller-icons/apple-touch-icon.png")).ok(),
  ).toBe(true);
});
