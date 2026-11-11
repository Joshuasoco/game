import { afterEach, expect, it, vi } from "vitest";
import { GuidedPractice } from "../web/src/game/practice/guided-practice";
import { practiceFeed } from "../web/src/game/practice/ball-machine";
afterEach(() => vi.unstubAllGlobals());
it("requires each lesson and two hits aimed to the same side, then persists completion", () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  });
  const tutorial = new GuidedPractice(0);
  const steps: unknown[] = [];
  tutorial.onStep = (e) => steps.push(e);
  expect(tutorial.observe("hit", 1)).toBe(false);
  expect(tutorial.snapshot(20000).hint).toBe(true);
  expect(tutorial.observe("arrive", 20001)).toBe(true);
  expect(tutorial.snapshot(20002).hint).toBe(false);
  tutorial.observe("hit", 21000);
  tutorial.observe("whiff", 22000);
  tutorial.observe("hit", 23000);
  expect(tutorial.step).toBe(5);
  expect(tutorial.observe("hit", 24000, 0)).toBe(false);
  tutorial.observe("hit", 25000, -0.8);
  tutorial.observe("hit", 26000, 0.8);
  expect(tutorial.done).toBe(false);
  tutorial.observe("hit", 27000, 0.8);
  expect(tutorial.done).toBe(true);
  expect(GuidedPractice.completed()).toBe(true);
  expect(steps).toHaveLength(5);
  expect(new GuidedPractice(28000, true).step).toBe(1);
});
it("resumes persisted steps and survives unavailable storage", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => "[1,2]",
    setItem: () => {
      throw Error();
    },
  });
  const tutorial = new GuidedPractice(0);
  expect(tutorial.step).toBe(3);
  expect(() => tutorial.skip(10)).not.toThrow();
  tutorial.observe("whiff", 20);
  expect(tutorial.step).toBe(4);
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw Error();
    },
  });
  expect(new GuidedPractice(0).step).toBe(1);
  expect(GuidedPractice.completed()).toBe(false);
  expect(practiceFeed(4)).toEqual(practiceFeed(4));
  expect(practiceFeed(4).mustBounce).toBe(true);
});
