import { describe, it, expect } from "vitest";
import { Rules } from "../web/src/game/rules";
describe("singles rally rules", () => {
  it("requires the serve and return to bounce before a volley", () => {
    const r = new Rules();
    r.start();
    expect(r.apply({ type: "hit", side: "ai", feetZ: -4 })?.fault).toBe(
      "two-bounce rule",
    );
    const s = new Rules();
    s.start();
    s.apply({ type: "bounce", x: -1, z: -4 });
    s.apply({ type: "hit", side: "ai", feetZ: -4 });
    expect(s.apply({ type: "hit", side: "player", feetZ: 4 })?.fault).toBe(
      "two-bounce rule",
    );
  });
  it("permits a volley after the two-bounce sequence", () => {
    const r = new Rules();
    r.start();
    r.apply({ type: "bounce", x: -1, z: -4 });
    r.apply({ type: "hit", side: "ai", feetZ: -4 });
    r.apply({ type: "bounce", x: 1, z: 4 });
    r.apply({ type: "hit", side: "player", feetZ: 4 });
    expect(r.apply({ type: "hit", side: "ai", feetZ: -3 })).toBeUndefined();
    expect(r.shots).toBe(4);
  });
  it.each([
    { x: 1, z: -4 },
    { x: -1, z: -2.1336 },
    { x: 0, z: -5 },
  ])("rejects illegal service landing %s", (p) => {
    const r = new Rules();
    r.start();
    expect(r.apply({ type: "bounce", ...p })?.fault).toBe(
      "wrong service court",
    );
  });
  it("awards a double bounce to the hitter only once", () => {
    const r = new Rules();
    r.start();
    r.apply({ type: "bounce", x: -1, z: -4 });
    expect(r.apply({ type: "bounce", x: -1, z: -5 })?.winner).toBe("player");
    r.apply({ type: "net" });
    expect(r.score).toEqual([1, 0]);
  });
  it("allows court lines but calls out past the line", () => {
    const r = new Rules();
    r.start();
    expect(r.apply({ type: "bounce", x: -3.048, z: -6.7056 })).toBeUndefined();
    const s = new Rules();
    s.start();
    expect(s.apply({ type: "bounce", x: -3.2, z: -5 })?.fault).toBe("out");
  });
  it("faults kitchen volleys, permits kitchen ground strokes", () => {
    const r = new Rules();
    r.start();
    r.shots = 3;
    expect(r.apply({ type: "hit", side: "ai", feetZ: -1 })?.fault).toBe(
      "kitchen volley",
    );
    const s = new Rules();
    s.start();
    s.shots = 3;
    s.bounces = 1;
    expect(s.apply({ type: "hit", side: "ai", feetZ: -1 })).toBeUndefined();
  });
  it("net and missed returns score for the other side", () => {
    const r = new Rules();
    r.start();
    expect(r.apply({ type: "net" })?.winner).toBe("ai");
    r.start("ai");
    expect(r.apply({ type: "miss", side: "player" })?.winner).toBe("ai");
  });
  it("requires eleven points and a two point margin", () => {
    const r = new Rules();
    r.score = [10, 10];
    r.start();
    r.point("ai", "out");
    expect(r.winner).toBeUndefined();
    r.start();
    r.point("ai", "out");
    expect(r.winner).toBe("player");
    expect(r.serving).toBe("player");
  });
});
