import { it, expect } from "vitest";
import { PaddleGesture } from "../web/src/controller/paddle-gesture";
it("handles a finger release without requiring a synthesized click", () => {
  const g = new PaddleGesture();
  g.begin(1, "touch");
  expect(g.release(1, 10)).toBe(true);
  expect(g.release(1, 11)).toBe(false);
  expect(g.acceptsClick(20)).toBe(false);
  g.begin(2, "touch");
  expect(g.release(2, 100)).toBe(true);
  expect(g.acceptsClick(110)).toBe(false);
});
it("keeps mouse clicks and click-only accessibility activation usable", () => {
  const g = new PaddleGesture();
  expect(g.acceptsClick(0)).toBe(true);
  g.begin(1, "mouse");
  expect(g.release(1, 10)).toBe(false);
  expect(g.acceptsClick(11)).toBe(true);
});
it("does not turn a cancelled gesture or another finger into a swing", () => {
  const g = new PaddleGesture();
  g.begin(1, "touch");
  expect(g.release(2, 10)).toBe(false);
  g.cancel(1, 11);
  expect(g.release(1, 12)).toBe(false);
  expect(g.acceptsClick(13)).toBe(false);
  expect(g.acceptsClick(900)).toBe(true);
});
