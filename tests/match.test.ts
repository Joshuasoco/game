import { afterEach, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import { Game } from "../web/src/game/engine";
import type { CourtScene } from "../web/src/screen/scene";
import type { Difficulty } from "../shared/src/protocol";
vi.mock("../web/src/game/audio", () => ({
  Audio: class {
    muted = true;
    start() {}
    play() {}
    dispose() {}
  },
}));
afterEach(() => vi.unstubAllGlobals());
it.each<Difficulty>(["easy", "medium", "hard"])(
  "plays a complete match with real physics on %s",
  async (difficulty) => {
    let nextFrame: FrameRequestCallback = () => {};
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      nextFrame = cb;
      return 1;
    });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    const scene = {
      player: { group: { position: new Vector3() } },
      ai: { group: { position: new Vector3() } },
      setActive() {},
      setBall() {},
      render() {},
      hit() {},
      dispose() {},
    } as unknown as CourtScene;
    const game = new Game(scene, () => {});
    await game.init();
    game.start(difficulty);
    let time = performance.now(),
      seq = 0,
      maxRally = 0;
    for (let frame = 0; frame < 100000 && game.phase !== "matchover"; frame++) {
      const s = game.snapshot();
      maxRally = Math.max(maxRally, s.rally);
      if (
        (s.phase === "serve" && s.serving === "player") ||
        (s.phase === "rally" &&
          game.rules.lastHitter === "ai" &&
          (game.rules.shots > 2 || game.rules.bounces > 0))
      )
        game.input({
          seq: ++seq,
          power: 0.6,
          side: "forehand",
          tilt: Math.sin(frame * 0.2) * 0.7,
          lob: false,
          tPhone: Date.now(),
        });
      time += 1000 / 30;
      nextFrame(time);
    }
    expect(game.phase, JSON.stringify(game.snapshot())).toBe("matchover");
    expect(game.rules.winner).toBeDefined();
    expect(Math.max(...game.rules.score)).toBeGreaterThanOrEqual(11);
    expect(
      Math.abs(game.rules.score[0] - game.rules.score[1]),
    ).toBeGreaterThanOrEqual(2);
    expect(maxRally).toBeGreaterThanOrEqual(2);
    game.dispose();
  },
  20000,
);
