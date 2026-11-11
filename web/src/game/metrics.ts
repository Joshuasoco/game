export class LocalMetrics {
  private sessionId =
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  private events: {
    event: string;
    sessionId: string;
    at: number;
    fields: Record<string, string | number | boolean>;
  }[] = [];
  enabled = false;
  private counts: Record<string, number> = {};
  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem("dink-metrics") ?? "{}");
      if (saved && typeof saved === "object")
        for (const [k, v] of Object.entries(saved))
          if (typeof v === "number" && Number.isFinite(v) && v >= 0)
            this.counts[k] = v;
    } catch {
      /* Optional. */
    }
  }
  record(
    event: "swing" | "hit" | "perfect" | "good" | "late" | "fault" | "point",
  ) {
    if (!this.enabled) return;
    this.counts[event] = (this.counts[event] ?? 0) + 1;
    try {
      localStorage.setItem("dink-metrics", JSON.stringify(this.counts));
    } catch {
      /* Optional. */
    }
  }
  snapshot() {
    return { ...this.counts };
  }
  event(
    event:
      | "whiff"
      | "fault"
      | "swing_in_reach"
      | "tutorial_step"
      | "first_rally_complete",
    fields: Record<string, string | number | boolean>,
  ) {
    if (!this.enabled) return;
    this.events.push({
      event,
      sessionId: this.sessionId,
      at: Date.now(),
      fields,
    });
    this.events = this.events.slice(-200);
    try {
      localStorage.setItem("dink-clarity-events", JSON.stringify(this.events));
    } catch {
      /* Optional. */
    }
  }
  eventSnapshot() {
    return this.events.map((event) => ({
      ...event,
      fields: { ...event.fields },
    }));
  }
  clear() {
    this.counts = {};
    this.events = [];
    try {
      localStorage.removeItem("dink-metrics");
      localStorage.removeItem("dink-clarity-events");
    } catch {
      /* Optional. */
    }
  }
}
