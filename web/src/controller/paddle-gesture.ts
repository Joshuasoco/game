// Handle real pointer releases directly. Mobile browsers may omit the
// compatibility click after pointer capture, a drag, or a touch gesture.
export class PaddleGesture {
  private pointer?: { id: number; type: string };
  private ignoreClickUntil = -Infinity;
  begin(id: number, type: string) {
    this.pointer = { id, type };
  }
  release(id: number, now: number): boolean {
    if (this.pointer?.id !== id) return false;
    const direct = this.pointer.type === "touch" || this.pointer.type === "pen";
    this.pointer = undefined;
    if (direct) this.ignoreClickUntil = now + 800;
    return direct;
  }
  cancel(id: number, now: number) {
    if (this.pointer?.id !== id) return;
    this.pointer = undefined;
    this.ignoreClickUntil = now + 800;
  }
  acceptsClick(now: number) {
    return now > this.ignoreClickUntil;
  }
}
