import type { Side } from "@dink/shared";

/** A tie is deuce; only the leader can win on the next point. */
export function matchPointSide(
  score: readonly [number, number],
): Side | undefined {
  if (Math.max(...score) < 10 || score[0] === score[1]) return;
  return score[0] > score[1] ? "player" : "ai";
}

export function showKeyboardHints(score: readonly [number, number]): boolean {
  return score[0] + score[1] < 3;
}
