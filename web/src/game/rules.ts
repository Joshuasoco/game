import type { Side } from "@dink/shared";
import { COURT } from "./tuning";
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
  }
  point(loser: Side, fault: Fault) {
    if (this.ended) return;
    this.ended = true;
    this.fault = fault;
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
      if (this.shots <= 2 && this.bounces === 0)
        return this.point(e.side, "two-bounce rule");
      if (this.bounces === 0 && Math.abs(e.feetZ) <= COURT.kitchen)
        return this.point(e.side, "kitchen volley");
      this.lastHitter = e.side;
      this.shots++;
      this.bounces = 0;
      return;
    }
    const side: Side = e.z > 0 ? "player" : "ai";
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
