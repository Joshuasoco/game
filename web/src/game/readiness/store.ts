import type { ReadinessSnapshot } from "./evaluate";
import { READINESS } from "./config";

/** Display smoothing only. Input always evaluates the current physical state. */
export class ReadinessStore {
  current?: ReadinessSnapshot;
  private candidate = "";
  private frames = 0;
  private listeners = new Set<(snapshot: ReadinessSnapshot) => void>();
  subscribe(listener: (snapshot: ReadinessSnapshot) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  update(raw: ReadinessSnapshot) {
    let state = raw.state;
    if (
      this.current?.state === "IN_REACH" &&
      state === "GET_READY" &&
      raw.distance <= raw.reachRadius * READINESS.hysteresisExit
    )
      state = "IN_REACH";
    this.frames = this.candidate === state ? this.frames + 1 : 1;
    this.candidate = state;
    // Never delay valid windows or rule blocks, dead balls, and recovery.
    if (
      this.current &&
      state !== this.current.state &&
      (state === "FAR" || state === "GET_READY") &&
      this.frames < READINESS.minStateFrames
    )
      return false;
    const changed =
      this.current?.state !== state ||
      this.current?.blockReason !== raw.blockReason;
    this.current = { ...raw, state };
    if (changed) this.listeners.forEach((listener) => listener(this.current!));
    return changed;
  }
  reset() {
    this.current = undefined;
    this.candidate = "";
    this.frames = 0;
  }
}
