export const COURT = {
  halfWidth: 3.048,
  halfLength: 6.7056,
  kitchen: 2.1336,
  net: 0.9144,
  ballRadius: 0.037,
} as const;
export const PHYSICS = {
  dt: 1 / 120,
  gravity: 9.81,
  drag: 0.026,
  restitution: 0.76,
  bufferMs: 200,
} as const;
export const SKILL = {
  easy: { speed: 3.0, reaction: 0.38, error: 0.55, miss: 0.12 },
  medium: { speed: 4.2, reaction: 0.23, error: 0.28, miss: 0.045 },
  hard: { speed: 5.5, reaction: 0.12, error: 0.1, miss: 0.012 },
} as const;
