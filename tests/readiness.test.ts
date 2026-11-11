import { describe, it, expect } from "vitest";
import {
  evaluateReadiness,
  resolveReachRadius,
  type ReadinessContext,
} from "../web/src/game/readiness/evaluate";
import { ReadinessStore } from "../web/src/game/readiness/store";
import {
  ControllerSync,
  ReadinessReceiver,
} from "../web/src/game/readiness/controller-sync";
import { clarityEnabled } from "../web/src/game/readiness/preferences";
import { Rules } from "../web/src/game/rules";
import { seeded } from "../web/src/game/solver";
const context = (): ReadinessContext => ({
  ball: {
    pos: { x: 0, y: 1.1, z: 4 },
    velocity: { x: 0, y: 0, z: 2 },
    alive: true,
    incoming: true,
  },
  player: {
    contactPoint: { x: 0, y: 1.1, z: 4 },
    feetZ: 4,
    id: "pip",
    swingCooldownUntil: 0,
  },
  rally: { shots: 3, bounces: 1 },
  difficulty: "easy",
  now: 1,
});
describe("swing readiness and referee contract", () => {
  it("handles dead, outgoing, far, close, reachable and recovering balls", () => {
    const ctx = context();
    ctx.ball.alive = false;
    expect(evaluateReadiness(ctx).state).toBe("NO_BALL");
    ctx.ball.alive = true;
    ctx.ball.incoming = false;
    expect(evaluateReadiness(ctx).state).toBe("NO_BALL");
    ctx.ball.incoming = true;
    ctx.ball.pos.x = 3;
    expect(evaluateReadiness(ctx).state).toBe("FAR");
    ctx.ball.pos.x = 2;
    expect(evaluateReadiness(ctx).state).toBe("GET_READY");
    ctx.ball.pos.x = 1.5;
    expect(evaluateReadiness(ctx).state).toBe("IN_REACH");
    ctx.player.swingCooldownUntil = 2;
    ctx.ball.alive = false;
    expect(evaluateReadiness(ctx).state).toBe("RECOVERING");
  });
  it.each([
    [1, "SERVE_MUST_BOUNCE"],
    [2, "RETURN_MUST_BOUNCE"],
  ] as const)("warns before shot %s is volleyed", (shots, reason) => {
    const ctx = context();
    ctx.rally = { shots, bounces: 0 };
    expect(evaluateReadiness(ctx)).toMatchObject({
      state: "WAIT_BOUNCE",
      blockReason: reason,
    });
    ctx.player.feetZ = 1;
    expect(evaluateReadiness(ctx)).toMatchObject({
      state: "WAIT_KITCHEN",
      blockReason: "KITCHEN_VOLLEY",
    });
  });
  it("allows a legal volley, resolves difficulty and character reach, and predicts entry", () => {
    const ctx = context();
    ctx.rally.bounces = 0;
    expect(evaluateReadiness(ctx).state).toBe("IN_REACH");
    expect(resolveReachRadius("pip", "easy")).toBeGreaterThan(
      resolveReachRadius("pip", "hard"),
    );
    expect(resolveReachRadius("unknown", "easy")).toBe(1.35);
    ctx.ball.pos.z = 1;
    expect(evaluateReadiness(ctx).timeToReach).toBeCloseTo(0.75);
    ctx.ball.velocity.z = -2;
    expect(evaluateReadiness(ctx).timeToReach).toBeNull();
    ctx.serving = true;
    ctx.ball.alive = false;
    expect(evaluateReadiness(ctx).state).toBe("IN_REACH");
  });
  it("agrees with the real referee for 10,000 generated ball and player states", () => {
    const random = seeded(20261111);
    const mapped = {
      SERVE_MUST_BOUNCE: "EARLY_SERVE_HIT",
      RETURN_MUST_BOUNCE: "EARLY_RETURN_HIT",
      KITCHEN_VOLLEY: "KITCHEN_VOLLEY",
    };
    const seen = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      const ctx = context();
      const rules = new Rules();
      rules.start("ai");
      rules.shots = 1 + Math.floor(random() * 8);
      rules.bounces = random() < 0.5 ? 0 : 1;
      ctx.rally = rules;
      ctx.difficulty = (["easy", "medium", "hard"] as const)[i % 3];
      ctx.player.feetZ = random() * 6;
      ctx.player.contactPoint.z = ctx.player.feetZ;
      ctx.ball.pos = { x: random() * 6 - 3, y: random() * 4, z: random() * 7 };
      const snap = evaluateReadiness(ctx);
      seen.add(snap.state);
      if (snap.state === "IN_REACH" || snap.state.startsWith("WAIT_")) {
        const result = rules.apply({
          type: "hit",
          side: "player",
          feetZ: ctx.player.feetZ,
        });
        if (snap.state === "IN_REACH") {
          expect(result).toBeUndefined();
          expect(rules.lastHitter).toBe("player");
          expect(snap.distance).toBeLessThanOrEqual(snap.reachRadius);
        } else expect(rules.reason).toBe(mapped[snap.blockReason!]);
      }
    }
    expect([...seen]).toEqual(
      expect.arrayContaining([
        "IN_REACH",
        "WAIT_BOUNCE",
        "WAIT_KITCHEN",
        "FAR",
        "GET_READY",
      ]),
    );
  });
  it("smooths display boundaries, publishes once, and never delays a valid window or fault", () => {
    const store = new ReadinessStore();
    const ctx = context();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => notifications++);
    store.update(evaluateReadiness(ctx));
    ctx.ball.pos.x = 1.55;
    store.update(evaluateReadiness(ctx));
    expect(store.current?.state).toBe("IN_REACH");
    expect(evaluateReadiness(ctx).state).toBe("GET_READY");
    ctx.ball.pos.x = 2;
    store.update(evaluateReadiness(ctx));
    store.update(evaluateReadiness(ctx));
    expect(store.current?.state).toBe("GET_READY");
    ctx.ball.pos.x = 1;
    store.update(evaluateReadiness(ctx));
    expect(store.current?.state).toBe("IN_REACH");
    ctx.rally.bounces = 0;
    ctx.rally.shots = 1;
    store.update(evaluateReadiness(ctx));
    expect(store.current?.state).toBe("WAIT_BOUNCE");
    expect(notifications).toBe(4);
    unsubscribe();
  });
  it("sends state changes and 10 Hz keepalives, drops duplicate and stale packets", () => {
    const sync = new ControllerSync(),
      receiver = new ReadinessReceiver();
    const snap = evaluateReadiness(context());
    const first = sync.message(snap, 0, false, true)!;
    expect(receiver.accept(first)).toBe(true);
    expect(sync.message(snap, 99, false, true)).toBeUndefined();
    const second = sync.message(snap, 100, false, true)!;
    expect(second.seq).toBeGreaterThan(first.seq);
    expect(receiver.accept(second)).toBe(true);
    expect(receiver.accept(first)).toBe(false);
    expect(receiver.accept(second)).toBe(false);
    expect(
      sync.message({ ...snap, state: "FAR" }, 101, false, true),
    ).toBeDefined();
    receiver.reset();
    expect(receiver.accept(first)).toBe(true);
  });
  it("defaults rollout to Pip + Easy and permits explicit overrides", () => {
    expect(clarityEnabled("easy", "pip")).toBe(true);
    expect(clarityEnabled("medium", "pip")).toBe(false);
    expect(clarityEnabled("easy", "rocket")).toBe(false);
    expect(clarityEnabled("hard", "june", true)).toBe(true);
    expect(clarityEnabled("easy", "pip", false)).toBe(false);
  });
});
