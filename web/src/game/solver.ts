import { COURT, PHYSICS } from "./tuning";
export interface Vec {
  x: number;
  y: number;
  z: number;
}
export type Shot = "dink" | "drive" | "lob" | "smash" | "serve";
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export function seeded(seed = 42) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Identical velocity update to the Rapier ball: gravity is applied explicitly,
// then the zero-gravity world integrates this velocity at the fixed timestep.
export function integrateVelocity(v: Vec, dt = PHYSICS.dt): Vec {
  const drag = 1 / (1 + PHYSICS.drag * Math.hypot(v.x, v.y, v.z) * dt);
  return {
    x: v.x * drag,
    y: (v.y - PHYSICS.gravity * dt) * drag,
    z: v.z * drag,
  };
}
export function trace(
  start: Vec,
  velocity: Vec,
): { landing: Vec; netHeight: number; time: number } {
  let p = { ...start };
  let v = { ...velocity };
  let netHeight = Infinity;
  for (let i = 0; i < 1200; i++) {
    const previous = p;
    v = integrateVelocity(v);
    p = {
      x: p.x + v.x * PHYSICS.dt,
      y: p.y + v.y * PHYSICS.dt,
      z: p.z + v.z * PHYSICS.dt,
    };
    if (previous.z * p.z <= 0 && previous.z !== p.z) {
      const a = -previous.z / (p.z - previous.z);
      netHeight = previous.y + (p.y - previous.y) * a;
    }
    if (p.y <= COURT.ballRadius && v.y < 0) {
      const a = (previous.y - COURT.ballRadius) / (previous.y - p.y);
      return {
        landing: {
          x: previous.x + (p.x - previous.x) * a,
          y: COURT.ballRadius,
          z: previous.z + (p.z - previous.z) * a,
        },
        netHeight,
        time: (i + a) * PHYSICS.dt,
      };
    }
  }
  return { landing: p, netHeight, time: 10 };
}
export function solveShot(
  start: Vec,
  target: Vec,
  shot: Shot = "drive",
  power = 0.65,
): Vec {
  const distance = Math.hypot(target.x - start.x, target.z - start.z);
  let time =
    shot === "lob"
      ? 2.25
      : shot === "dink"
        ? 1.25
        : shot === "serve"
          ? 1.5
          : shot === "smash"
            ? Math.max(0.55, distance / (11 + power * 4))
            : Math.max(0.75, distance / (7 + power * 5));
  let result: Vec = { x: 0, y: 0, z: 0 };
  for (let clearance = 0; clearance < 8; clearance++) {
    let vx = (target.x - start.x) / time;
    let vz = (target.z - start.z) / time;
    const vy =
      (COURT.ballRadius - start.y + 0.5 * PHYSICS.gravity * time * time) / time;
    // With fixed vertical launch speed, correct horizontal velocity by shooting.
    for (let i = 0; i < 14; i++) {
      const prediction = trace(start, { x: vx, y: vy, z: vz });
      const dx = target.x - prediction.landing.x;
      const dz = target.z - prediction.landing.z;
      vx += dx / Math.max(0.2, prediction.time);
      vz += dz / Math.max(0.2, prediction.time);
      if (Math.hypot(dx, dz) < 0.0005) break;
    }
    result = { x: vx, y: vy, z: vz };
    if (trace(start, result).netHeight > COURT.net + 0.16) break;
    time += 0.18;
  }
  return result;
}
export function shotType(power: number, height: number, lob: boolean): Shot {
  return lob
    ? "lob"
    : power < 0.35
      ? "dink"
      : power > 0.82 && height > 1.8
        ? "smash"
        : "drive";
}
export function targetFor(
  side: "player" | "ai",
  tilt: number,
  shot: Shot,
  random = () => 0.5,
  error = 0,
): Vec {
  const sign = side === "player" ? -1 : 1;
  return {
    x: clamp(tilt * 2.45 + (random() - 0.5) * error, -2.8, 2.8),
    y: COURT.ballRadius,
    z:
      sign *
      clamp(
        (shot === "dink" ? 1.45 : shot === "lob" ? 5.8 : 4.5) +
          (random() - 0.5) * error,
        0.6,
        6.4,
      ),
  };
}
