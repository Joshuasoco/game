import { clamp } from "../game/solver";

export const CHARGE_MS = 700;
export const TAP_POWER = 0.55;
const TAP_MS = 140;
const LOB_DISTANCE = 44;

/** Short taps are medium shots; longer presses charge continuously to full. */
export function chargePower(duration: number) {
  return (
    TAP_POWER +
    (1 - TAP_POWER) * clamp((duration - TAP_MS) / (CHARGE_MS - TAP_MS), 0, 1)
  );
}

export class SwingPress {
  private press?: {
    id: number;
    at: number;
    x: number;
    y: number;
    lob: boolean;
  };
  private ignoreClickUntil = -Infinity;

  begin(id: number, at: number, x: number, y: number) {
    if (this.press) return false;
    this.press = { id, at, x, y, lob: false };
    return true;
  }
  move(id: number, x: number, y: number) {
    const p = this.press;
    if (!p || p.id !== id) return;
    if (p.y - y >= LOB_DISTANCE && p.y - y > Math.abs(x - p.x)) p.lob = true;
  }
  power(now: number) {
    return this.press ? chargePower(now - this.press.at) : 0;
  }
  get active() {
    return !!this.press;
  }
  get lob() {
    return this.press?.lob ?? false;
  }
  release(id: number, now: number) {
    if (!this.press || this.press.id !== id) return;
    const shot = { power: this.power(now), lob: this.press.lob };
    this.press = undefined;
    // Pointer releases send directly for every device; ignore the compatibility click.
    this.ignoreClickUntil = now + 800;
    return shot;
  }
  cancel(now: number, id?: number) {
    if (id !== undefined && this.press?.id !== id) return;
    this.press = undefined;
    this.ignoreClickUntil = now + 800;
  }
  acceptsClick(now: number) {
    return now > this.ignoreClickUntil;
  }
}

/** Relative dragging never jumps to an absolute position on the first touch. */
export class RelativeAim {
  value = 0;
  private pointer?: { id: number; x: number; value: number };
  get active() {
    return !!this.pointer;
  }
  begin(id: number, x: number) {
    if (this.pointer) return false;
    this.pointer = { id, x, value: this.value };
    return true;
  }
  move(id: number, x: number, width: number) {
    if (this.pointer?.id !== id) return;
    this.value = clamp(
      this.pointer.value + (x - this.pointer.x) / Math.max(64, width * 0.35),
      -1,
      1,
    );
  }
  release(id: number) {
    if (this.pointer?.id === id) this.pointer = undefined;
  }
  reset() {
    this.pointer = undefined;
    this.value = 0;
  }
  step(dt: number, reducedMotion = false) {
    if (!this.active) {
      this.value *= reducedMotion ? 0 : Math.exp(-dt / 180);
      if (Math.abs(this.value) < 0.002) this.value = 0;
    }
    return this.value;
  }
}
