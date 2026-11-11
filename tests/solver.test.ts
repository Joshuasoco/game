import { describe, it, expect } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  seeded,
  solveShot,
  trace,
  integrateVelocity,
  type Shot,
} from "../web/src/game/solver";
import { PHYSICS, COURT } from "../web/src/game/tuning";
describe("fixed-step shot solver", () => {
  it("lands 1,000 seeded shots within 5 cm while clearing the net", () => {
    const random = seeded(1729);
    const shots: Shot[] = ["dink", "drive", "lob", "smash", "serve"];
    for (let i = 0; i < 1000; i++) {
      const sign = i % 2 ? 1 : -1;
      const p = {
        x: random() * 5 - 2.5,
        y: 0.25 + random() * 2.1,
        z: sign * (2.5 + random() * 4),
      };
      const shot = shots[i % shots.length];
      const target = {
        x: random() * 5 - 2.5,
        y: COURT.ballRadius,
        z: -sign * (shot === "dink" ? 1 + random() : 3 + random() * 3),
      };
      const prediction = trace(p, solveShot(p, target, shot));
      expect(
        Math.hypot(
          prediction.landing.x - target.x,
          prediction.landing.z - target.z,
        ),
      ).toBeLessThan(0.05);
      expect(prediction.netHeight).toBeGreaterThan(COURT.net);
    }
  });
  it("matches an actual Rapier dynamic ball trajectory", async () => {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    world.timestep = PHYSICS.dt;
    const start = { x: 1.5, y: 0.85, z: 5.9 },
      target = { x: -1.6, y: COURT.ballRadius, z: -4.8 };
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(start.x, start.y, start.z)
        .setCcdEnabled(true),
    );
    world.createCollider(RAPIER.ColliderDesc.ball(COURT.ballRadius), body);
    body.setLinvel(solveShot(start, target, "serve"), true);
    let previous = { ...start };
    let landing = { ...start };
    for (let i = 0; i < 600; i++) {
      previous = { ...body.translation() };
      body.setLinvel(integrateVelocity(body.linvel()), true);
      world.step();
      const p = body.translation();
      if (p.y <= COURT.ballRadius) {
        const a = (previous.y - COURT.ballRadius) / (previous.y - p.y);
        landing = {
          x: previous.x + (p.x - previous.x) * a,
          y: COURT.ballRadius,
          z: previous.z + (p.z - previous.z) * a,
        };
        break;
      }
    }
    expect(Math.hypot(landing.x - target.x, landing.z - target.z)).toBeLessThan(
      0.05,
    );
    world.free();
  });
  it("produces deterministic AI randomness", () => {
    const a = seeded(1),
      b = seeded(1);
    expect(Array.from({ length: 20 }, a)).toEqual(
      Array.from({ length: 20 }, b),
    );
  });
});
