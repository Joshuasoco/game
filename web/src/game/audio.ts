import { Howl, Howler } from "howler";
// Tiny original PCM sounds generated locally; no external sound licenses/assets.
function tone(frequency: number, duration: number, slide: number): string {
  const length = Math.floor(22050 * duration);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const write = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  write(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 22050, true);
  view.setUint32(28, 44100, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const t = i / 22050;
    view.setInt16(
      44 + i * 2,
      Math.sin(2 * Math.PI * (frequency * t + slide * t * t)) *
        Math.exp(-t * 35) *
        15000,
      true,
    );
  }
  let binary = "";
  for (const byte of new Uint8Array(buffer))
    binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}
export class Audio {
  muted = false;
  private sounds?: Record<"hit" | "bounce" | "point" | "net", Howl>;
  start() {
    if (!this.sounds)
      this.sounds = {
        hit: new Howl({
          src: [tone(620, 0.14, -1500)],
          format: ["wav"],
          volume: 0.42,
        }),
        bounce: new Howl({
          src: [tone(240, 0.1, -400)],
          format: ["wav"],
          volume: 0.3,
        }),
        point: new Howl({
          src: [tone(880, 0.3, 800)],
          format: ["wav"],
          volume: 0.25,
        }),
        net: new Howl({
          src: [tone(110, 0.17, -150)],
          format: ["wav"],
          volume: 0.4,
        }),
      };
    void Howler.ctx?.resume();
  }
  play(name: "hit" | "bounce" | "point" | "net") {
    if (!this.muted) this.sounds?.[name].play();
  }
  dispose() {
    Object.values(this.sounds ?? {}).forEach((s) => s.unload());
  }
}
