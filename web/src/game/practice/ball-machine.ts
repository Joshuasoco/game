import { COURT } from "../tuning";
/** Repeatable feeds use the match's existing shot solver and physics. */
export function practiceFeed(step: number) {
  const x = step === 5 ? -0.8 : -1.4;
  return {
    origin: { x, y: 0.9, z: -4.8 },
    target: { x: -x, y: COURT.ballRadius, z: 4.8 },
    mustBounce: step === 4,
  };
}
