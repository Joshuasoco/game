export function wav(
  sample: (t: number, i: number) => number,
  duration: number,
  rate = 11025,
): string {
  const length = Math.floor(rate * duration),
    buffer = new ArrayBuffer(44 + length * 2),
    v = new DataView(buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  v.setUint32(4, 36 + length * 2, true);
  text(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++)
    v.setInt16(
      44 + i * 2,
      Math.max(-1, Math.min(1, sample(i / rate, i))) * 24000,
      true,
    );
  let out = "";
  for (const b of new Uint8Array(buffer)) out += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(out)}`;
}
export function pop(frequency: number, duration: number, noise = 0.08) {
  return wav(
    (t, i) =>
      (Math.sin(6.283 * (frequency * t - 500 * t * t)) * 0.75 +
        Math.sin(i * 13.731) * noise) *
      Math.exp(-t * 35),
    duration,
  );
}
export function musicStem(layer: number) {
  const notes =
    layer === 0
      ? [130.81, 164.81, 196, 164.81]
      : layer === 1
        ? [261.63, 329.63, 392, 440, 392, 329.63, 293.66, 329.63]
        : [523.25, 0, 659.25, 0, 587.33, 0, 392, 0];
  return wav((t) => {
    const beat = t / (layer === 0 ? 1 : 0.5),
      idx = Math.floor(beat) % notes.length,
      local = beat % 1;
    const f = notes[idx];
    if (!f) return 0;
    const envelope =
      Math.sin(local * Math.PI) * Math.exp(-local * (layer === 0 ? 1 : 3));
    return (
      (Math.sin(6.283 * f * t) * 0.65 + Math.sin(6.283 * f * 2 * t) * 0.17) *
      envelope *
      0.3
    );
  }, 4);
}
