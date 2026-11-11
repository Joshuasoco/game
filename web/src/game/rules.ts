import type { Side, BlockReason } from "@dink/shared";
import { COURT } from "./tuning";
import type { Vec } from "./solver";
export interface HitRules {
  shots: number;
  bounces: number;
}
export type FaultReason =
  | "NET"
  | "OUT"
  | "DOUBLE_BOUNCE"
  | "EARLY_SERVE_HIT"
  | "EARLY_RETURN_HIT"
  | "KITCHEN_VOLLEY"
  | "WRONG_SERVICE_COURT"
  | "MISSED_RETURN";
export interface FaultEvent {
  reason: FaultReason;
  ballPos: Vec;
  bounces: Vec[];
  side: Side;
}
export function hitBlockReason(
  rally: HitRules,
  feetZ: number,
): BlockReason | null {
  if (rally.bounces > 0) return null;
  if (Math.abs(feetZ) <= COURT.kitchen) return "KITCHEN_VOLLEY";
  if (rally.shots <= 2)
    return rally.shots === 1 ? "SERVE_MUST_BOUNCE" : "RETURN_MUST_BOUNCE";
  return null;
}
export type Fault =
  | "out"
  | "net"
  | "double bounce"
  | "two-bounce rule"
  | "kitchen volley"
  | "wrong service court"
  | "missed return";
export type RuleEvent =
  | { type: "hit"; side: Side; feetZ: number }
  | { type: "bounce"; x: number; z: number }
  | { type: "net" }
  | { type: "miss"; side: Side };
const opposite = (s: Side): Side => (s === "player" ? "ai" : "player");
export class Rules {
  score: [number, number] = [0, 0];
  serving: Side = "player";
  lastHitter: Side = "player";
  shots = 0;
  bounces = 0;
  serveX = 1;
  ended = false;
  fault?: Fault;
  reason?: FaultReason;
  bounceSpots: Vec[] = [];
  private pendingReason?: FaultReason;
  get winner(): Side | undefined {
    if (
      Math.max(...this.score) >= 11 &&
      Math.abs(this.score[0] - this.score[1]) >= 2
    )
      return this.score[0] > this.score[1] ? "player" : "ai";
  }
  start(server: Side = this.serving, serveX = 1) {
    this.serving = server;
    this.lastHitter = server;
    this.shots = 1;
    this.bounces = 0;
    this.serveX = serveX;
    this.ended = false;
    this.fault = undefined;
    this.reason = undefined;
    this.bounceSpots = [];
  }
  point(loser: Side, fault: Fault) {
    if (this.ended) return;
    this.ended = true;
    this.fault = fault;
    this.reason =
      this.pendingReason ??
      (
        {
          out: "OUT",
          net: "NET",
          "double bounce": "DOUBLE_BOUNCE",
          "two-bounce rule":
            this.shots === 1 ? "EARLY_SERVE_HIT" : "EARLY_RETURN_HIT",
          "kitchen volley": "KITCHEN_VOLLEY",
          "wrong service court": "WRONG_SERVICE_COURT",
          "missed return": "MISSED_RETURN",
        } as const
      )[fault];
    this.pendingReason = undefined;
    const winner = opposite(loser);
    this.score[winner === "player" ? 0 : 1]++;
    this.serving = winner;
    return { winner, fault };
  }
  apply(e: RuleEvent): { winner: Side; fault: Fault } | undefined {
    if (this.ended) return;
    if (e.type === "net") return this.point(this.lastHitter, "net");
    if (e.type === "miss") return this.point(e.side, "missed return");
    if (e.type === "hit") {
      if (e.side === this.lastHitter)
        return this.point(e.side, "double bounce");
      const block = hitBlockReason(this, e.feetZ);
      if (block) {
        this.pendingReason =
          block === "KITCHEN_VOLLEY"
            ? "KITCHEN_VOLLEY"
            : block === "SERVE_MUST_BOUNCE"
              ? "EARLY_SERVE_HIT"
              : "EARLY_RETURN_HIT";
        return this.point(
          e.side,
          block === "KITCHEN_VOLLEY" ? "kitchen volley" : "two-bounce rule",
        );
      }
      this.lastHitter = e.side;
      this.shots++;
      this.bounces = 0;
      this.bounceSpots = [];
      return;
    }
    const side: Side = e.z > 0 ? "player" : "ai";
    this.bounceSpots.push({ x: e.x, y: COURT.ballRadius, z: e.z });
    if (
      Math.abs(e.x) > COURT.halfWidth + 0.0254 ||
      Math.abs(e.z) > COURT.halfLength + 0.0254
    )
      return this.point(this.lastHitter, "out");
    if (side === this.lastHitter) return this.point(this.lastHitter, "out");
    if (
      this.shots === 1 &&
      this.bounces === 0 &&
      (Math.abs(e.z) <= COURT.kitchen + 0.0254 || e.x * this.serveX >= 0)
    )
      return this.point(this.lastHitter, "wrong service court");
    this.bounces++;
    if (this.bounces >= 2) return this.point(side, "double bounce");
  }
}
