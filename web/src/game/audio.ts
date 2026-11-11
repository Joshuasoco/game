import { Howl, Howler } from "howler";
import { pop, musicStem, wav } from "./synthesis";
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
export interface AudioLevels {
  master: number;
  sfx: number;
  music: number;
  ambience: number;
}
export class Audio {
  private silent = false;
  levels: AudioLevels = { master: 0.7, sfx: 0.7, music: 0.24, ambience: 0.18 };
  private sounds?: Record<
    | "hit"
    | "bounce"
    | "kitchen"
    | "net"
    | "perfect"
    | "point"
    | "ui"
    | "ready"
    | "whiff"
    | "fault",
    Howl
  >;
  private stems: Howl[] = [];
  private crowd?: Howl;
  private targets: number[] = [];
  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem("dink-audio") ?? "null");
      if (saved)
        for (const k of Object.keys(this.levels) as (keyof AudioLevels)[])
          if (typeof saved[k] === "number")
            this.levels[k] = Math.max(0, Math.min(1, saved[k]));
    } catch {
      /* Optional. */
    }
  }
  get muted() {
    return this.silent;
  }
  set muted(value: boolean) {
    this.silent = value;
    this.applyLevels();
  }
  start() {
    if (!this.sounds) {
      const sound = (src: string) =>
        new Howl({ src: [src], format: ["wav"], volume: 0, preload: true });
      this.sounds = {
        hit: sound(pop(590, 0.16, 0.24)),
        bounce: sound(pop(210, 0.12)),
        kitchen: sound(pop(170, 0.14, 0.12)),
        net: sound(pop(110, 0.12, 0.3)),
        perfect: sound(pop(1220, 0.09, 0)),
        point: sound(tone(660, 0.36, 700)),
        ui: sound(pop(420, 0.06, 0)),
        ready: sound(tone(760, 0.12, 1600)),
        whiff: sound(
          wav(
            (t, i) =>
              (Math.sin(i * 8.173) + Math.sin(i * 0.731)) *
              0.07 *
              Math.exp(-t * 25),
            0.16,
          ),
        ),
        fault: sound(tone(440, 0.22, -900)),
      };
      this.stems = [0, 1, 2].map(
        (i) =>
          new Howl({
            src: [musicStem(i)],
            format: ["wav"],
            loop: true,
            volume: 0,
          }),
      );
      this.crowd = new Howl({
        src: [
          wav(
            (t, i) =>
              (Math.sin(i * 8.173) + Math.sin(i * 0.731)) *
              0.024 *
              (0.65 + 0.35 * Math.sin(t * 3.14159)),
            4,
          ),
        ],
        format: ["wav"],
        loop: true,
        volume: 0,
      });
      this.applyLevels();
    }
    void Howler.ctx?.resume();
  }
  setLevels(levels: Partial<AudioLevels>) {
    for (const k of Object.keys(levels) as (keyof AudioLevels)[]) {
      const value = levels[k];
      if (value !== undefined && Number.isFinite(value))
        this.levels[k] = Math.max(0, Math.min(1, value));
    }
    this.applyLevels();
    try {
      localStorage.setItem("dink-audio", JSON.stringify(this.levels));
    } catch {
      /* Optional. */
    }
  }
  private applyLevels() {
    const master = this.silent ? 0 : this.levels.master;
    Object.values(this.sounds ?? {}).forEach((s) =>
      s.volume(master * this.levels.sfx * 0.6),
    );
    this.stems.forEach((s, i) =>
      s.volume(master * this.levels.music * (this.targets[i] ?? 0)),
    );
    this.crowd?.volume(master * this.levels.ambience * (this.targets[3] ?? 0));
  }
  setRally(rally: number, active: boolean) {
    if (!this.sounds) return;
    const next = [
      active ? 0.55 : 0,
      active && rally >= 3 ? 0.4 : 0,
      active && rally >= 7 ? 0.32 : 0,
      active ? Math.min(1, 0.25 + rally * 0.06) : 0,
    ];
    const master = this.silent ? 0 : this.levels.master;
    this.stems.forEach((s, i) => {
      if (next[i] && !s.playing()) s.play();
      const target = next[i] * master * this.levels.music;
      if (this.targets[i] !== next[i]) s.fade(s.volume(), target, 700);
    });
    if (active && !this.crowd?.playing()) this.crowd?.play();
    if (this.targets[3] !== next[3])
      this.crowd?.fade(
        this.crowd.volume(),
        next[3] * master * this.levels.ambience,
        700,
      );
    this.targets = next;
  }
  play(
    name:
      | "hit"
      | "bounce"
      | "kitchen"
      | "point"
      | "net"
      | "perfect"
      | "ui"
      | "ready"
      | "whiff"
      | "fault",
    power = 0.6,
  ) {
    if (this.silent) return;
    const sound = this.sounds?.[name];
    if (!sound) return;
    const id = sound.play();
    if (name === "hit")
      sound.rate(0.8 + Math.max(0, Math.min(1, power)) * 0.45, id);
  }
  dispose() {
    Object.values(this.sounds ?? {}).forEach((s) => s.unload());
    this.stems.forEach((s) => s.unload());
    this.crowd?.unload();
  }
}
