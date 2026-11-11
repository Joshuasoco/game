export type Quality = "low" | "medium" | "high";
export type QualityPreference = Quality | "auto";
export function detectQuality(): Quality {
  const memory =
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (
    memory <= 4 ||
    navigator.hardwareConcurrency <= 4 ||
    matchMedia("(pointer: coarse)").matches
  )
    return "low";
  // Start conservatively; sustained frame-time monitoring can lower this further.
  return "medium";
}
export interface Preferences {
  quality: QualityPreference;
  reducedMotion: boolean;
  analytics: boolean;
}
export const defaults: Preferences = {
  quality: "auto",
  reducedMotion: false,
  analytics: false,
};
export function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem("dink-preferences") ?? "{}");
    return {
      quality: ["auto", "low", "medium", "high"].includes(value.quality)
        ? value.quality
        : "auto",
      reducedMotion:
        typeof value.reducedMotion === "boolean" ? value.reducedMotion : false,
      analytics: value.analytics === true,
    };
  } catch {
    return { ...defaults };
  }
}
export function savePreferences(p: Preferences) {
  try {
    localStorage.setItem("dink-preferences", JSON.stringify(p));
  } catch {
    /* Optional storage. */
  }
}
