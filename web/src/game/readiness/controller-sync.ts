import type { ReadinessMessage } from "@dink/shared";
import type { ReadinessSnapshot } from "./evaluate";
export class ControllerSync {
  private seq = 0;
  private lastAt = -Infinity;
  private lastKey = "";
  message(
    snap: ReadinessSnapshot,
    now: number,
    serving: boolean,
    enabled: boolean,
  ): ReadinessMessage | undefined {
    const key = `${snap.state}:${snap.blockReason}:${serving}:${enabled}`;
    if (key === this.lastKey && now - this.lastAt < 100) return;
    this.lastKey = key;
    this.lastAt = now;
    return {
      type: "readiness",
      seq: ++this.seq,
      state: snap.state,
      blockReason: snap.blockReason,
      timeToReachMs:
        snap.timeToReach === null ? null : Math.round(snap.timeToReach * 1000),
      serving,
      enabled,
    };
  }
}
export class ReadinessReceiver {
  current?: ReadinessMessage;
  accept(message: ReadinessMessage) {
    if (this.current && message.seq <= this.current.seq) return false;
    this.current = message;
    return true;
  }
  reset() {
    this.current = undefined;
  }
}
