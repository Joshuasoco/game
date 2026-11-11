import type { Difficulty } from "@dink/shared";
export interface ClarityPreferences {
  readiness_v2?: boolean;
  swingCue: boolean;
  highContrast: boolean;
  minimal: boolean;
  hideOnHard: boolean;
}
export function readClarityPreferences(): ClarityPreferences {
  let saved: Partial<ClarityPreferences> = {};
  try {
    saved = JSON.parse(localStorage.getItem("dink-clarity") ?? "{}") ?? {};
  } catch {
    /* Optional. */
  }
  return {
    readiness_v2:
      typeof saved.readiness_v2 === "boolean" ? saved.readiness_v2 : undefined,
    swingCue: saved.swingCue !== false,
    highContrast: saved.highContrast === true,
    minimal: saved.minimal === true,
    hideOnHard: saved.hideOnHard === true,
  };
}
export function clarityEnabled(
  difficulty: Difficulty,
  rival: string,
  override?: boolean,
) {
  return override ?? (difficulty === "easy" && rival === "pip");
}
export function saveClarityPreferences(value: ClarityPreferences) {
  try {
    localStorage.setItem("dink-clarity", JSON.stringify(value));
  } catch {
    /* Optional. */
  }
}
