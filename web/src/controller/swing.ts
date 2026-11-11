import type { Calibration } from "@dink/shared";
import { clamp } from "../game/solver";
export interface MotionSample {
  t: number;
  alpha: number;
  beta: number;
  gamma: number;
  roll: number;
}
export interface DetectedSwing {
  peak: number;
  sign: 1 | -1;
  tilt: number;
  time: number;
  axis: "alpha" | "beta" | "gamma";
}
export class SwingDetector {
  sensitivity = 1;
  neutral = 0;
  scale = 650;
  threshold = 250;
  axis: "alpha" | "beta" | "gamma" = "beta";
  swingSign: 1 | -1 = 1;
  hand: Calibration["hand"] = "right";
  private active?: DetectedSwing;
  private cooldown = -Infinity;
  private calibrated = false;
  sample(s: MotionSample): DetectedSwing | undefined {
    if (s.t < this.cooldown) return;
    const axes = ["alpha", "beta", "gamma"] as const;
    const axis = this.calibrated
      ? this.axis
      : axes.reduce((a, b) => (Math.abs(s[a]) > Math.abs(s[b]) ? a : b));
    const speed = Math.abs(s[axis]) * this.sensitivity;
    if (!this.active) {
      if (speed >= this.threshold)
        this.active = {
          peak: speed,
          sign: s[axis] >= 0 ? 1 : -1,
          tilt: s.roll,
          time: s.t,
          axis,
        };
      return;
    }
    if (speed > this.active.peak)
      this.active = {
        peak: speed,
        sign: s[axis] >= 0 ? 1 : -1,
        tilt: s.roll,
        time: s.t,
        axis,
      };
    if (speed < this.active.peak * 0.5 || s.t - this.active.time > 220) {
      const hit = this.active;
      this.active = undefined;
      this.cooldown = s.t + 300;
      return hit;
    }
  }
  calibrate(
    samples: DetectedSwing[],
    neutral: number,
    hand: Calibration["hand"],
  ) {
    this.axis = samples[0]?.axis ?? "beta";
    this.swingSign = samples.reduce((n, s) => n + s.sign, 0) >= 0 ? 1 : -1;
    this.scale = Math.max(
      300,
      samples.reduce((n, s) => n + s.peak, 0) / Math.max(1, samples.length),
    );
    this.threshold = Math.min(250, this.scale * 0.36);
    this.neutral = neutral;
    this.hand = hand;
    this.calibrated = true;
  }
  map(s: DetectedSwing) {
    const tilt = (s.tilt - this.neutral) / 35;
    return {
      power: clamp(s.peak / this.scale, 0.1, 1),
      side: (s.sign === this.swingSign ? "forehand" : "backhand") as
        "forehand" | "backhand",
      tilt: Math.abs(tilt) < 0.08 ? 0 : clamp(tilt, -1, 1),
      tPhone: s.time,
    };
  }
}
