export type Timing = "perfect" | "good" | "late";
export function judgeTiming(deltaMs: number): {
  grade: Timing;
  accuracy: number;
  pace: number;
} {
  const error = Math.abs(deltaMs);
  return error <= 45
    ? { grade: "perfect", accuracy: 0.035, pace: 1.045 }
    : error <= 120
      ? { grade: "good", accuracy: 0.16, pace: 1 }
      : { grade: "late", accuracy: 0.9, pace: 0.78 };
}
// Arrival at the ideal 0.95 m contact plane. Negative values are early.
export function timingDelta(height: number, verticalSpeed: number, ageMs = 0) {
  return (
    ((0.95 - height) / Math.max(1, Math.abs(verticalSpeed))) * 1000 - ageMs
  );
}
