import type { Difficulty, SwingReadiness, BlockReason } from "@dink/shared";
import { hitBlockReason, type HitRules } from "../rules";
import type { Vec } from "../solver";
import { READINESS, type ReadinessConfig } from "./config";

export interface ReadinessSnapshot {
  state: SwingReadiness;
  distance: number;
  reachRadius: number;
  getReadyRadius: number;
  timeToReach: number | null;
  blockReason: BlockReason | null;
}
export interface ReadinessContext {
  ball: { pos: Vec; velocity: Vec; alive: boolean; incoming: boolean };
  player: {
    contactPoint: Vec;
    feetZ: number;
    id: string;
    swingCooldownUntil: number;
  };
  rally: HitRules;
  difficulty: Difficulty;
  now: number;
  serving?: boolean;
}
export function resolveReachRadius(
  id: string,
  difficulty: Difficulty,
  cfg = READINESS,
) {
  return (
    cfg.reachRadius[difficulty].base +
    ((cfg.characterReachBonus as Record<string, number>)[id] ?? 0)
  );
}
export function evaluateReadiness(
  ctx: ReadinessContext,
  cfg: ReadinessConfig = READINESS,
): ReadinessSnapshot {
  const { ball, player } = ctx;
  const radius = resolveReachRadius(player.id, ctx.difficulty, cfg);
  const dx = ball.pos.x - player.contactPoint.x;
  const dy = ball.pos.y - player.contactPoint.y;
  const dz = ball.pos.z - player.contactPoint.z;
  const distance = Math.hypot(dx, dy, dz);
  const v = ball.velocity;
  const a = v.x ** 2 + v.y ** 2 + v.z ** 2;
  const b = 2 * (dx * v.x + dy * v.y + dz * v.z);
  const disc = b * b - 4 * a * (distance ** 2 - radius ** 2);
  const entry = a > 0 && disc >= 0 ? (-b - Math.sqrt(disc)) / (2 * a) : -1;
  const snap: ReadinessSnapshot = {
    state: "FAR",
    distance,
    reachRadius: radius,
    getReadyRadius: radius * cfg.getReadyMultiplier,
    timeToReach: distance <= radius ? 0 : entry >= 0 ? entry : null,
    blockReason: null,
  };
  if (ctx.now < player.swingCooldownUntil) snap.state = "RECOVERING";
  else if (ctx.serving) snap.state = "IN_REACH";
  else if (!ball.alive || !ball.incoming) snap.state = "NO_BALL";
  else {
    // Shared with the referee. Kitchen takes priority over the two-bounce rule.
    const block = hitBlockReason(ctx.rally, player.feetZ);
    if (distance <= snap.getReadyRadius && block) {
      snap.blockReason = block;
      snap.state = block === "KITCHEN_VOLLEY" ? "WAIT_KITCHEN" : "WAIT_BOUNCE";
    } else if (distance <= radius) snap.state = "IN_REACH";
    else if (distance <= snap.getReadyRadius) snap.state = "GET_READY";
  }
  return snap;
}
