import { describe, it, expect } from "vitest";
import { judgeTiming, timingDelta } from "../web/src/game/timing";
import {
  RIVALS,
  chooseShot,
  adaptiveFactor,
  spinBounce,
  type RivalId,
} from "../web/src/game/ai";
import { seeded, solveShot, trace } from "../web/src/game/solver";
describe("timing and bounce control", () => {
  it("has explicit inclusive timing windows and bounded advantages", () => {
    expect(judgeTiming(45).grade).toBe("perfect");
    expect(judgeTiming(-45).grade).toBe("perfect");
    expect(judgeTiming(46).grade).toBe("good");
    expect(judgeTiming(120).grade).toBe("good");
    expect(judgeTiming(121)).toMatchObject({ grade: "late", pace: 0.78 });
    expect(timingDelta(0.95, -2)).toBe(0);
    expect(timingDelta(0.65, -2)).toBeGreaterThan(0);
  });
  it("topspin kicks forward while underspin slows and lifts the bounce", () => {
    const v = { x: 1, y: 3, z: -8 };
    const top = spinBounce(v, 1),
      under = spinBounce(v, -1);
    expect(Math.abs(top.z)).toBeGreaterThan(Math.abs(v.z));
    expect(Math.abs(under.z)).toBeLessThan(Math.abs(v.z));
    expect(under.y).toBeGreaterThan(top.y);
    expect(spinBounce(v, 0)).toEqual(v);
  });
  it("changes challenge only after three consecutive results", () => {
    expect(adaptiveFactor([false, false])).toBe(1);
    expect(adaptiveFactor([false, false, false])).toBe(0.9);
    expect(adaptiveFactor([true, true, true])).toBe(1.08);
    expect(adaptiveFactor([true, false, true])).toBe(1);
  });
  it("a drop clears the net and lands in the kitchen", () => {
    const p = { x: 1, y: 0.9, z: 5 },
      target = { x: -1, y: 0.037, z: -1.8 };
    const landed = trace(p, solveShot(p, target, "drop"));
    expect(landed.netHeight).toBeGreaterThan(0.9144);
    expect(
      Math.hypot(landed.landing.x - target.x, landed.landing.z - target.z),
    ).toBeLessThan(0.05);
  });
});
it("personalities have distinct reproducible shot distributions", () => {
  const counts = {} as Record<RivalId, Record<string, number>>;
  for (const id of Object.keys(RIVALS) as RivalId[]) {
    const random = seeded(72);
    counts[id] = {};
    for (let i = 0; i < 10000; i++) {
      const shot = chooseShot(id, random, {
        height: 1.3,
        distance: 3,
        opponentZ: 5,
      });
      counts[id][shot] = (counts[id][shot] ?? 0) + 1;
    }
    expect(counts[id].smash ?? 0).toBe(0);
  }
  expect(counts.rocket.drive).toBeGreaterThan(counts.pip.drive);
  expect(counts.mabel.dink).toBeGreaterThan(counts.pip.dink);
  expect(counts.june.drop).toBeGreaterThan(counts.rocket.drop);
});
