import { it, expect } from "vitest";
import { SwingDetector } from "../web/src/controller/swing";
it("detects a peak once and suppresses the return motion", () => {
  const d = new SwingDetector();
  const sample = (t: number, beta: number) =>
    d.sample({ t, beta, alpha: 0, gamma: 0, roll: 12 });
  expect(sample(0, 150)).toBeUndefined();
  expect(sample(16, 300)).toBeUndefined();
  sample(32, 650);
  const hit = sample(48, 200);
  expect(hit?.peak).toBe(650);
  expect(hit?.time).toBe(32);
  expect(sample(100, -700)).toBeUndefined();
  expect(sample(150, 100)).toBeUndefined();
  sample(400, -500);
  expect(sample(430, 100)?.sign).toBe(-1);
});
it("maps neutral tilt and left-hand calibration without compass heading", () => {
  const d = new SwingDetector();
  const swing = {
    peak: 500,
    sign: -1 as const,
    tilt: 10,
    time: 5,
    axis: "alpha" as const,
  };
  d.calibrate([swing, swing, swing], 10, "left");
  expect(d.map(swing)).toMatchObject({ power: 1, tilt: 0, side: "forehand" });
  expect(d.map({ ...swing, sign: 1, tilt: 100 })).toMatchObject({
    side: "backhand",
    tilt: 1,
  });
});
it("ignores gentle handling below the swing threshold", () => {
  const d = new SwingDetector();
  for (let t = 0; t < 1000; t += 16)
    expect(
      d.sample({ t, alpha: 40, beta: 110, gamma: 80, roll: 20 }),
    ).toBeUndefined();
});
