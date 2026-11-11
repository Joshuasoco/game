import { expect, it } from "vitest";
import * as T from "three";
import { ImpactEffects, MotionTrail } from "../web/src/screen/effects";
it("aligns restrained squash to velocity and clears all residuals immediately", () => {
  const effects = new ImpactEffects();
  const ball = new T.Mesh(new T.SphereGeometry(0.14));
  const camera = new T.PerspectiveCamera();
  effects.impact({ x: 0, y: 1, z: 0 }, true, false, { x: 8, y: 0, z: 0 });
  effects.update(0, camera, ball);
  expect(ball.scale.y).toBeCloseTo(1.15);
  expect(ball.scale.x).toBeCloseTo(0.93);
  const axis = new T.Vector3(0, 1, 0).applyQuaternion(ball.quaternion);
  expect(axis.x).toBeCloseTo(1);
  effects.clear(ball);
  expect(ball.scale.toArray()).toEqual([1, 1, 1]);
  expect(effects.group.children.every((o) => !o.visible)).toBe(true);
  effects.update(0, camera, ball);
  expect(effects.group.children.every((o) => !o.visible)).toBe(true);
});
it("never revives old particles after reduced motion and recovers squash in 100 ms", () => {
  const effects = new ImpactEffects(),
    ball = new T.Mesh(),
    camera = new T.Camera();
  effects.impact({ x: 0, y: 1, z: 0 }, false);
  effects.update(0.101, camera, ball);
  expect(ball.scale.toArray()).toEqual([1, 1, 1]);
  effects.enabled = false;
  effects.clear(ball);
  effects.impact({ x: 0, y: 1, z: 0 }, true);
  effects.enabled = true;
  effects.update(0, camera, ball);
  expect(effects.group.children.every((o) => !o.visible)).toBe(true);
});
it("samples a bounded trail by time at 30/60/120 Hz without bridging resets or pause", () => {
  const paths = [30, 60, 120].map((hz) => {
    const trail = new MotionTrail();
    trail.update({ x: 0, y: 1, z: 0 }, 0, true);
    for (let i = 1; i <= hz; i++)
      trail.update({ x: (i / hz) * 6, y: 1, z: 0 }, 1 / hz, true);
    expect(trail.points.length).toBeLessThanOrEqual(21);
    const path = trail.points.map((p) => p.x);
    trail.update({ x: 3, y: 1, z: 8 }, 1 / hz, false);
    expect(trail.points).toHaveLength(0);
    trail.update({ x: 3, y: 1, z: 8 }, 1 / hz, true);
    expect(trail.points.length).toBeLessThanOrEqual(2);
    trail.clear();
    expect(trail.points).toHaveLength(0);
    return path;
  });
  for (const path of paths.slice(1))
    path.forEach((x, i) => expect(x).toBeCloseTo(paths[0][i], 5));
});
