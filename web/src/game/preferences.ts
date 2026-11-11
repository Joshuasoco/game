export type Quality = "low" | "medium" | "high";
export interface Preferences {
  quality: Quality;
  reducedMotion: boolean;
  analytics: boolean;
}
export const defaults: Preferences = {
  quality: "medium",
  reducedMotion: false,
  analytics: false,
};
export function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem("dink-preferences") ?? "{}");
    return {
      quality: ["low", "medium", "high"].includes(value.quality)
        ? value.quality
        : "medium",
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
