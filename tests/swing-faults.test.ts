import { expect, it, vi, afterEach } from "vitest";
import { Rules } from "../web/src/game/rules";
import { LocalMetrics } from "../web/src/game/metrics";
afterEach(() => vi.unstubAllGlobals());
it("keeps both bounce locations for a double-bounce explanation and clears them on hits", () => {
  const rules = new Rules();
  rules.start("ai");
  rules.shots = 3;
  rules.apply({ type: "bounce", x: 1, z: 4 });
  rules.apply({ type: "bounce", x: 1.2, z: 4.6 });
  expect(rules.reason).toBe("DOUBLE_BOUNCE");
  expect(rules.bounceSpots.map(({ x, z }) => ({ x, z }))).toEqual([
    { x: 1, z: 4 },
    { x: 1.2, z: 4.6 },
  ]);
  rules.start("ai");
  rules.shots = 3;
  rules.apply({ type: "bounce", x: 1, z: 4 });
  rules.apply({ type: "hit", side: "player", feetZ: 4 });
  expect(rules.bounceSpots).toEqual([]);
});
it("records consented telemetry with session IDs, bounded fields, and clearable storage", () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
  const metrics = new LocalMetrics();
  metrics.event("whiff", {
    state: "FAR",
    distance: 4,
    difficulty: "easy",
    pointIndex: 0,
  });
  expect(metrics.eventSnapshot()).toEqual([]);
  expect(storage.size).toBe(0);
  metrics.enabled = true;
  for (let i = 0; i < 210; i++)
    metrics.event("tutorial_step", {
      step: 2,
      attempts: i,
      durationMs: 200,
      skipped: false,
    });
  const events = metrics.eventSnapshot();
  expect(events).toHaveLength(200);
  expect(events[0].fields.attempts).toBe(10);
  expect(new Set(events.map((e) => e.sessionId)).size).toBe(1);
  expect(events[0].sessionId.length).toBeGreaterThan(0);
  expect(JSON.parse(storage.get("dink-clarity-events")!)).toHaveLength(200);
  metrics.clear();
  expect(storage.has("dink-clarity-events")).toBe(false);
});
