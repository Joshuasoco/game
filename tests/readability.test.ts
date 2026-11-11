import { expect, it } from "vitest";
import {
  matchPointSide,
  showKeyboardHints,
} from "../web/src/screen/match-presentation";

it("shows match point for either leader, including extended deuce games", () => {
  expect(matchPointSide([9, 8])).toBeUndefined();
  expect(matchPointSide([10, 10])).toBeUndefined();
  expect(matchPointSide([14, 14])).toBeUndefined();
  expect(matchPointSide([10, 9])).toBe("player");
  expect(matchPointSide([9, 10])).toBe("ai");
  expect(matchPointSide([15, 14])).toBe("player");
  expect(matchPointSide([14, 15])).toBe("ai");
});

it("keeps hints for exactly three points and restores them for a rematch", () => {
  expect(showKeyboardHints([0, 0])).toBe(true);
  expect(showKeyboardHints([1, 1])).toBe(true);
  expect(showKeyboardHints([0, 2])).toBe(true);
  expect(showKeyboardHints([2, 1])).toBe(false);
  expect(showKeyboardHints([0, 3])).toBe(false);
  expect(showKeyboardHints([11, 9])).toBe(false);
  expect(showKeyboardHints([0, 0])).toBe(true);
});
