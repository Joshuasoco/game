import { COPY, READINESS } from "../readiness/config";
export interface PracticeSnapshot {
  step: number;
  line: string;
  hint: boolean;
  hits: number;
}
export class GuidedPractice {
  step = 1;
  hits = 0;
  attempts = 0;
  private aimSide = 0;
  private started: number;
  private completed = new Set<number>();
  onStep?: (data: {
    step: number;
    attempts: number;
    durationMs: number;
    skipped: boolean;
  }) => void;
  constructor(now: number, replay = false) {
    this.started = now;
    if (!replay) {
      try {
        const stored = JSON.parse(
          localStorage.getItem("tutorial.completedSteps") ?? "[]",
        );
        if (Array.isArray(stored))
          stored.forEach((n) => {
            if (Number.isInteger(n) && n >= 1 && n <= 5) this.completed.add(n);
          });
        while (this.completed.has(this.step)) this.step++;
      } catch {
        /* Optional storage. */
      }
    }
  }
  static completed() {
    try {
      const value = JSON.parse(
        localStorage.getItem("tutorial.completedSteps") ?? "[]",
      );
      return (
        Array.isArray(value) && [1, 2, 3, 4, 5].every((n) => value.includes(n))
      );
    } catch {
      return false;
    }
  }
  get done() {
    return this.step > 5;
  }
  snapshot(now: number): PracticeSnapshot {
    return {
      step: this.step,
      line: COPY.practice.steps[this.step - 1] ?? "",
      hint: now - this.started >= READINESS.hintAfterMs,
      hits: this.hits,
    };
  }
  observe(event: "arrive" | "whiff" | "hit", now: number, aim = 0) {
    if (this.done) return false;
    if (event !== "arrive") this.attempts++;
    const pass =
      (this.step === 1 && event === "arrive") ||
      (this.step === 2 && event === "hit") ||
      (this.step === 3 && event === "whiff") ||
      (this.step === 4 && event === "hit");
    if (this.step === 5 && event === "hit" && Math.abs(aim) > 0.2) {
      const side = Math.sign(aim);
      this.hits = side === this.aimSide ? this.hits + 1 : 1;
      this.aimSide = side;
      if (this.hits < 2) return false;
    } else if (!pass) return false;
    this.onStep?.({
      step: this.step,
      attempts: this.attempts,
      durationMs: now - this.started,
      skipped: false,
    });
    this.completed.add(this.step);
    try {
      localStorage.setItem(
        "tutorial.completedSteps",
        JSON.stringify([...this.completed]),
      );
    } catch {
      /* Optional. */
    }
    this.step++;
    this.started = now;
    this.attempts = this.hits = this.aimSide = 0;
    return true;
  }
  skip(now: number) {
    this.onStep?.({
      step: this.step,
      attempts: this.attempts,
      durationMs: now - this.started,
      skipped: true,
    });
    // Skipping dismisses automatic onboarding without claiming the steps were passed.
    try {
      localStorage.setItem("dink-practice-skipped", "1");
    } catch {
      /* Optional. */
    }
  }
}
