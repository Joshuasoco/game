import { it, expect, vi, afterEach } from "vitest";
import { LocalMetrics } from "../web/src/game/metrics";
import { readPreferences } from "../web/src/game/preferences";
afterEach(() => vi.unstubAllGlobals());
it("collects no local metrics until opt in and sends nothing over the network", () => {
  const save = vi.fn();
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: save,
    removeItem: vi.fn(),
  });
  const metrics = new LocalMetrics();
  metrics.record("hit");
  expect(metrics.snapshot()).toEqual({});
  expect(save).not.toHaveBeenCalled();
  metrics.enabled = true;
  metrics.record("hit");
  metrics.record("perfect");
  expect(metrics.snapshot()).toEqual({ hit: 1, perfect: 1 });
  metrics.enabled = false;
  metrics.record("point");
  expect(metrics.snapshot()).not.toHaveProperty("point");
  metrics.clear();
  expect(metrics.snapshot()).toEqual({});
});
it("rejects corrupted preferences and never enables analytics by default", () => {
  vi.stubGlobal("localStorage", { getItem: () => "{broken" });
  expect(readPreferences()).toEqual({
    quality: "medium",
    reducedMotion: false,
    analytics: false,
  });
  vi.stubGlobal("localStorage", {
    getItem: () =>
      JSON.stringify({
        quality: "ultra",
        reducedMotion: "yes",
        analytics: "true",
      }),
  });
  expect(readPreferences()).toEqual({
    quality: "medium",
    reducedMotion: false,
    analytics: false,
  });
});
it("normal text palette pairs meet WCAG AA", () => {
  const luminance = (hex: string) => {
    const values = hex
      .match(/../g)!
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  for (const [a, b] of [
    ["193f35", "f5f1df"],
    ["52674e", "fffdf1"],
    ["193f35", "93ad8c"],
  ]) {
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
    expect((values[0] + 0.05) / (values[1] + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
});
