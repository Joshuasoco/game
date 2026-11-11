import { afterEach, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { Game } from "../web/src/game/engine";
import type { CourtScene } from "../web/src/screen/scene";
import type { Swing } from "../shared/src/protocol";
vi.mock("../web/src/game/audio", () => ({
  Audio: class {
    start() {}
    play() {}
    dispose() {}
  },
}));
afterEach(() => vi.unstubAllGlobals());
async function setup() {
  let frame: FrameRequestCallback = () => {};
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frame = cb;
    return 1;
  });
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  });
  const scene = {
    player: { group: { position: new Vector3() } },
    ai: { group: { position: new Vector3() } },
    setActive() {},
    setBall() {},
    render: vi.fn(),
    react: vi.fn(),
    hit: vi.fn(),
    dispose() {},
  } as unknown as CourtScene;
  const game = new Game(scene, () => {});
  await game.init();
  game.start("easy");
  const internal = game as unknown as {
    body: RAPIER.RigidBody;
    elapsed: number;
    cooldownUntil: number;
    swing?: unknown;
    inReachAt: number;
  };
  let time = performance.now(),
    seq = 0;
  const advance = (frames = 1) => {
    for (let i = 0; i < frames; i++) {
      time += 1000 / 120;
      frame(time);
    }
  };
  const press = (tilt = 0): Swing => {
    const input: Swing = {
      seq: ++seq,
      power: 0.6,
      side: "forehand",
      tilt,
      lob: false,
      tPhone: Date.now(),
    };
    game.input(input);
    return input;
  };
  const place = (x = 0, shots = 3, bounces = 1, z = 4) => {
    game.rules.start("ai");
    game.rules.shots = shots;
    game.rules.bounces = bounces;
    scene.player.group.position.set(0, 0, z);
    internal.body.setTranslation({ x, y: 1.1, z }, true);
    internal.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    game.setPhase("rally", "");
  };
  return { game, internal, scene, advance, press, place, storage };
}
it("hits on the input frame and ignores presses during recovery without queueing", async () => {
  const { game, internal, place, press, advance } = await setup();
  place();
  expect(game.snapshot().readiness?.state).toBe("IN_REACH");
  press();
  expect(game.rules.lastHitter).toBe("player");
  expect(game.snapshot().hits).toBe(1);
  place();
  press();
  expect(game.snapshot().hits).toBe(1);
  expect(internal.swing).toBeUndefined();
  advance(30);
  press();
  expect(game.snapshot().hits).toBe(2);
  game.dispose();
});
it("whiffs without a point penalty and freezes cooldown and card timers during pause", async () => {
  const { game, internal, place, press, advance } = await setup();
  place(4);
  press();
  expect(game.snapshot().whiff).toContain("Too far");
  expect(game.rules.score).toEqual([0, 0]);
  const until = internal.cooldownUntil,
    elapsed = internal.elapsed;
  game.pause();
  advance(600);
  expect(internal.elapsed).toBe(elapsed);
  expect(internal.cooldownUntil).toBe(until);
  game.pause();
  expect(game.snapshot().readiness?.state).toBe("RECOVERING");
  advance(35);
  expect(game.snapshot().readiness?.state).not.toBe("RECOVERING");
  game.dispose();
});
it.each([
  [1, 4, "EARLY_SERVE_HIT"],
  [2, 4, "EARLY_RETURN_HIT"],
  [1, 1, "KITCHEN_VOLLEY"],
] as const)(
  "faults a warning immediately without buffering (shot %s, feet %s)",
  async (shots, feet, reason) => {
    const { game, internal, place, press, advance } = await setup();
    place(0, shots, 0, feet);
    expect(game.snapshot().readiness?.state).toMatch(/^WAIT_/);
    press();
    expect(game.phase).toBe("point");
    expect(game.snapshot().faultEvent?.reason).toBe(reason);
    expect(internal.swing).toBeUndefined();
    game.skipTransition();
    expect(game.phase).toBe("point");
    game.pause();
    advance(300);
    game.pause();
    expect(game.snapshot().faultEvent?.reason).toBe(reason);
    advance(160);
    expect(game.snapshot().faultEvent).toBeUndefined();
    game.dispose();
  },
);
it("buffers only GET_READY for 80 ms and gives a whiff if the window expires", async () => {
  const { game, internal, place, press, advance } = await setup();
  place(2);
  press();
  expect(internal.swing).toBeDefined();
  // A rapidly approaching ball enters reach before the deadline.
  internal.body.setLinvel({ x: -12, y: 0, z: 0 }, true);
  advance(8);
  expect(game.snapshot().hits).toBe(1);
  advance(30);
  place(2.3);
  press();
  advance(11);
  expect(internal.swing).toBeUndefined();
  expect(game.snapshot().whiff).toContain("Too early");
  expect(game.rules.score).toEqual([0, 0]);
  game.dispose();
});
it("completes all five lessons against deterministic feeds with the real physics engine", async () => {
  const { game, advance, press, storage } = await setup();
  game.start("easy", false, true, true);
  const reached = new Set<number>();
  for (let i = 0; i < 30000 && game.snapshot().practice; i++) {
    const state = game.snapshot();
    const step = state.practice!.step;
    reached.add(step);
    if (step === 3 && ["FAR", "NO_BALL"].includes(state.readiness?.state ?? ""))
      press();
    else if (step !== 1 && step !== 3 && state.readiness?.state === "IN_REACH")
      press(step === 5 ? -0.8 : 0);
    advance();
  }
  expect([...reached]).toEqual([1, 2, 3, 4, 5]);
  expect(game.snapshot().practice).toBeUndefined();
  expect(game.phase).toBe("serve");
  expect(game.rules.score).toEqual([0, 0]);
  expect(JSON.parse(storage.get("tutorial.completedSteps")!)).toEqual([
    1, 2, 3, 4, 5,
  ]);
  game.dispose();
});
it("keeps keyboard swings usable after a phone has sent a higher sequence number", async () => {
  const { game, place, advance } = await setup();
  place(4);
  const input: Swing = {
    seq: 100000,
    power: 0.6,
    side: "forehand",
    tilt: 0,
    lob: false,
    tPhone: Date.now(),
  };
  game.input(input);
  advance(35);
  place();
  game.input({ ...input, seq: 1 }, "keyboard");
  expect(game.rules.lastHitter).toBe("player");
  game.dispose();
});

it("acknowledges the winner when results open without delaying match state", async () => {
  const { game, scene } = await setup();
  game.rules.score = [11, 9];
  (game as unknown as { prepareServe: () => void }).prepareServe();
  expect(game.phase).toBe("matchover");
  expect(scene.react).toHaveBeenLastCalledWith("player");
  game.dispose();
});
