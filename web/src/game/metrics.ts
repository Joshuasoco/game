export class LocalMetrics {
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
  record(event: "swing" | "hit" | "perfect" | "fault" | "point") {
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
  clear() {
    this.counts = {};
    try {
      localStorage.removeItem("dink-metrics");
    } catch {
      /* Optional. */
    }
  }
}
