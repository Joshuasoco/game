import data from "./rivals.json";
import type { Shot } from "./solver";
export type RivalId = keyof typeof data;
export const RIVALS = data;
export function chooseShot(
  id: RivalId,
  random: () => number,
  context: { height: number; distance: number; opponentZ: number },
): Shot {
  const weights = { ...RIVALS[id].weights };
  if (context.height < 1.8) weights.smash = 0;
  if (context.distance > 4) {
    weights.dink *= 0.25;
    weights.drop *= 2;
  }
  if (Math.abs(context.opponentZ) < 3.2) weights.lob *= 5;
  const entries = Object.entries(weights) as [Exclude<Shot, "serve">, number][];
  let pick = random() * entries.reduce((n, [, w]) => n + w, 0);
  for (const [shot, weight] of entries) {
    pick -= weight;
    if (pick <= 0) return shot;
  }
  return "drive";
}
export function adaptiveFactor(results: readonly boolean[]): number {
  const recent = results.slice(-3);
  if (recent.length < 3) return 1;
  return recent.every(Boolean) ? 1.08 : recent.every((v) => !v) ? 0.9 : 1;
}
export function spinBounce(
  v: { x: number; y: number; z: number },
  spin: number,
) {
  const amount = Math.max(-1, Math.min(1, spin));
  return {
    x: v.x,
    y: Math.abs(v.y) * (amount > 0 ? 1 - 0.12 * amount : 1 - 0.15 * amount),
    z: v.z * (1 + 0.15 * amount),
  };
}
