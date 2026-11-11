import { describe, expect, it } from "vitest";
import {
  CHARGE_MS,
  chargePower,
  RelativeAim,
  SwingPress,
  TAP_POWER,
} from "../web/src/controller/thumb-input";
import { assistedDepth, assistedShot } from "../web/src/game/assistance";
import { swingSchema } from "../shared/src/protocol";
import { COURT } from "../web/src/game/tuning";

describe("two-thumb swing gestures", () => {
  it("maps taps to medium power and a 700ms charge to full, monotonically", () => {
    expect(chargePower(0)).toBe(TAP_POWER);
    expect(chargePower(140)).toBe(TAP_POWER);
    expect(chargePower(420)).toBeCloseTo(0.775);
    expect(chargePower(CHARGE_MS)).toBe(1);
    expect(chargePower(7000)).toBe(1);
    expect(chargePower(-30)).toBe(TAP_POWER);
    for (let t = 0; t < 700; t++)
      expect(chargePower(t + 1)).toBeGreaterThanOrEqual(chargePower(t));
  });
  it("detects an upward swipe while held, latches lob and ignores a horizontal drag", () => {
    const gesture = new SwingPress();
    gesture.begin(7, 0, 100, 200);
    gesture.move(7, 110, 155);
    gesture.move(7, 110, 190);
    expect(gesture.release(7, 420)).toEqual({ power: 0.775, lob: true });
    gesture.begin(8, 500, 100, 200);
    gesture.move(8, 200, 150);
    expect(gesture.release(8, 550)).toEqual({ power: TAP_POWER, lob: false });
  });
  it("owns one pointer, cancels without a shot, and suppresses duplicate clicks", () => {
    const gesture = new SwingPress();
    expect(gesture.begin(1, 0, 0, 0)).toBe(true);
    expect(gesture.begin(2, 1, 0, 0)).toBe(false);
    expect(gesture.release(2, 20)).toBeUndefined();
    expect(gesture.release(1, 30)).toEqual({ power: TAP_POWER, lob: false });
    expect(gesture.acceptsClick(31)).toBe(false);
    expect(gesture.acceptsClick(831)).toBe(true);
    gesture.begin(3, 900, 0, 0);
    gesture.cancel(1000, 3);
    expect(gesture.release(3, 1100)).toBeUndefined();
  });
});
describe("relative aim", () => {
  it("starts without jumping, clamps, and springs smoothly back after release", () => {
    const aim = new RelativeAim();
    aim.begin(1, 200);
    expect(aim.value).toBe(0);
    aim.move(1, 270, 400);
    expect(aim.value).toBe(0.5);
    expect(aim.step(180)).toBe(0.5);
    aim.release(1);
    expect(aim.step(180)).toBeCloseTo(0.5 / Math.E);
    aim.begin(2, 100);
    aim.move(2, 1000, 400);
    expect(aim.value).toBe(1);
    aim.release(2);
    aim.step(1, true);
    expect(aim.value).toBe(0);
  });
});
describe("assisted shots and footwork", () => {
  it("chooses a dink near the kitchen and a drop from deep for soft or low medium balls", () => {
    expect(assistedShot(0.2, 0.9, 2.5)).toBe("dink");
    expect(assistedShot(0.2, 0.9, 5.5)).toBe("drop");
    expect(assistedShot(0.55, 1.2, COURT.kitchen + 1)).toBe("dink");
    expect(assistedShot(0.55, 1.2, COURT.kitchen + 1.01)).toBe("drop");
    expect(assistedShot(0.7, 0.9, 5.5)).toBe("drive");
    expect(assistedShot(0.55, 1.3, 5.5)).toBe("drive");
    expect(assistedShot(0.95, 2, 4)).toBe("smash");
    expect(assistedShot(0.2, 0.9, 4, true)).toBe("lob");
    expect(assistedShot(0.9, 2, 4, false, true)).toBe("drop");
  });
  it("approaches after soft shots, retreats after deep shots, and prioritizes incoming depth", () => {
    expect(assistedDepth("dink", false, 6, false)).toBe(2.6);
    expect(assistedDepth("drop", false, 6, false)).toBe(2.6);
    for (const shot of ["lob", "drive", "smash"] as const)
      expect(assistedDepth(shot, false, 1, false)).toBe(5.8);
    expect(assistedDepth("drop", true, 6, false)).toBe(7);
    expect(assistedDepth("lob", true, 2.8, true)).toBe(2.8);
    expect(assistedDepth("lob", true, 0.4, true)).toBeGreaterThan(
      COURT.kitchen,
    );
    expect(assistedDepth("drop", true, 20, false)).toBe(7.3);
  });
  it("accepts unchanged legacy swings and an optional assisted flag", () => {
    const legacy = {
      seq: 1,
      power: 0.6,
      side: "forehand",
      tilt: 0,
      lob: false,
      tPhone: 1,
    };
    expect(swingSchema.parse(legacy)).toEqual(legacy);
    expect(swingSchema.parse({ ...legacy, assisted: true })).toEqual({
      ...legacy,
      assisted: true,
    });
    expect(swingSchema.safeParse({ ...legacy, assisted: "yes" }).success).toBe(
      false,
    );
  });
});
