import { describe, expect, it, vi } from "vitest";
import * as T from "three";
import { character } from "../web/src/screen/character";
vi.mock("../web/src/screen/art-surface", () => ({
  surface: (color: number) => new T.MeshStandardMaterial({ color }),
}));
const make = () => character(0xbd623f);
const advance = (
  c: ReturnType<typeof make>,
  seconds: number,
  hz = 60,
  moving = false,
) => {
  for (let i = 0; i < Math.round(seconds * hz); i++) {
    if (moving) c.group.position.x += 2 / hz;
    c.update(1 / hz, moving);
  }
};
describe("grounded visual rig", () => {
  it("parents shoes to hips and never animates the authoritative root", () => {
    const c = make();
    c.group.position.set(1, 0, 4);
    const original = c.group.position.clone();
    c.reset();
    c.react(true, "rocket");
    advance(c, 0.3);
    expect(c.leftShoe.parent).toBe(c.leftLeg);
    expect(c.group.position).toEqual(original);
    expect(c.group.rotation.toArray()).toEqual([0, 0, 0, "XYZ"]);
    expect(c.group.scale.toArray()).toEqual([1, 1, 1]);
  });
  it.each([30, 60, 120])(
    "stops feet when stationary at %s Hz and caps lift",
    (hz) => {
      const c = make();
      c.reset();
      advance(c, 0.9, hz, true);
      expect(Math.abs(c.leftLeg.rotation.z)).toBeGreaterThan(0.01);
      expect(c.leftLeg.position.y - 0.47).toBeLessThanOrEqual(0.06);
      advance(c, 0.15, hz);
      expect(Math.abs(c.leftLeg.rotation.z)).toBeLessThan(0.04);
      advance(c, 1, hz);
      expect(Math.abs(c.leftLeg.rotation.z)).toBeLessThan(0.00001);
      expect(c.body.position.y).toBeCloseTo(0, 5);
    },
  );
  it("travels the same gait distance across render rates", () => {
    const poses = [30, 60, 120].map((hz) => {
      const c = make();
      c.reset();
      advance(c, 1, hz, true);
      return [c.leftLeg.rotation.z, c.body.rotation.z, c.body.position.y];
    });
    for (const p of poses.slice(1))
      p.forEach((v, i) => expect(v).toBeCloseTo(poses[0][i], 2));
  });
  it("blends a point reset only through its visual child and clears practice/restart offsets", () => {
    const c = make();
    c.group.position.set(0, 0, 4);
    c.reset();
    c.group.position.x = 3;
    c.reset(true);
    expect(c.body.position.x).toBe(-3);
    expect(c.group.position.x).toBe(3);
    advance(c, 0.25);
    expect(c.body.position.x).toBeCloseTo(0);
    c.group.position.x = -3;
    c.reset();
    expect(c.body.position.x).toBe(0);
    advance(c, 0.1);
    expect(c.leftLeg.rotation.x).toBe(0);
  });
  it("ignores unannounced teleports and freezes when paused", () => {
    const c = make();
    c.reset();
    c.group.position.z = 10;
    c.update(1 / 60, true);
    expect(c.leftLeg.rotation.x).toBe(0);
    advance(c, 0.3, 60, true);
    const pose = c.leftLeg.rotation.toArray();
    c.update(0, true);
    expect(c.leftLeg.rotation.toArray()).toEqual(pose);
  });
});
describe("immediate, interruptible contact", () => {
  it("starts at contact, aligns reachable paddle face, then follows through and recovers", () => {
    const c = make();
    c.reset();
    const p = { x: 0.65, y: 1, z: -0.5 };
    c.hit({ shot: "drive", backhand: false, contact: p });
    expect(c.action).toBe("contact");
    c.group.updateMatrixWorld(true);
    const face = c.paddle.localToWorld(new T.Vector3(0, -0.35, 0));
    expect(face.distanceTo(new T.Vector3(p.x, p.y, p.z))).toBeLessThan(0.08);
    advance(c, 0.05);
    expect(c.action).toBe("follow-through");
    advance(c, 0.08);
    expect(c.action).toBe("recovery");
    advance(c, 0.2);
    expect(c.action).toBe("ready");
  });
  it("distinguishes shot identity and backhand without reclassifying the shot", () => {
    const poses = ["serve", "drive", "dink", "lob", "smash"].map((shot) => {
      const c = make();
      c.reset();
      c.hit({
        shot: shot as "drive",
        backhand: false,
        contact: { x: 0.7, y: 1, z: -0.4 },
      });
      return c.torso.rotation.y;
    });
    expect(new Set(poses).size).toBe(5);
    expect(Math.abs(poses[2])).toBeCloseTo(Math.abs(poses[1]) / 2);
    const c = make();
    c.hit({ shot: "drive", backhand: true });
    expect(Math.sign(c.torso.rotation.y)).toBe(-Math.sign(poses[1]));
  });
  it("repeated actions replace rather than queue; a whiff never flashes contact", () => {
    const c = make();
    c.reset();
    c.hit({ shot: "smash" });
    advance(c, 0.1);
    c.hit({ shot: "dink", whiff: true });
    expect(c.action).toBe("whiff");
    advance(c, 0.23);
    expect(c.action).toBe("ready");
    advance(c, 1);
    expect(c.action).toBe("ready");
  });
  it("reduced motion clears residuals immediately even while paused but keeps the paddle action", () => {
    const c = make();
    c.reset();
    advance(c, 0.3, 60, true);
    c.hit({ shot: "drive" });
    c.setReducedMotion(true);
    expect(c.body.position.toArray()).toEqual([0, 0, 0]);
    expect(c.body.rotation.z).toBe(0);
    expect(c.leftLeg.rotation.x).toBe(0);
    expect(c.leftLeg.rotation.z).toBe(0);
    expect(c.body.scale.toArray()).toEqual([1, 1, 1]);
    expect(c.action).toBe("contact");
    advance(c, 0.3);
    expect(c.action).toBe("ready");
  });
});

it("uses actual remaining engine hit-stop across input frames and pause/resume", () => {
  const c = make();
  c.reset();
  c.hit({ shot: "drive" });
  c.update(1 / 60, true, 0, 0.0583);
  expect(c.action).toBe("contact");
  c.update(0, false, 0, 0);
  c.update(1 / 60, true, 0, 0);
  expect(c.action).toBe("follow-through");
  c.hit({ shot: "drive" });
  c.update(1 / 60, true, 0, 0);
  expect(c.action).toBe("follow-through");
});

it("a point interrupts pending preparation and clears the old contact hold", () => {
  const c = make();
  c.prepare(true);
  c.react(true, "pip");
  advance(c, 2);
  expect(c.action).toBe("ready");
  c.hit({ shot: "drive" });
  c.react(false, "pip");
  advance(c, 0.1);
  expect(c.action).toBe("ready");
});
