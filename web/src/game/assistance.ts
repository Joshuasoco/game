import { clamp, shotType, type Shot } from "./solver";
import { COURT } from "./tuning";

/** Preserve explicit legacy lob/drop choices before applying assisted soft shots. */
export function assistedShot(
  power: number,
  height: number,
  depth: number,
  lob = false,
  drop = false,
): Shot {
  if (lob) return "lob";
  if (drop) return "drop";
  if (power < 0.35 || (power <= 0.6 && height <= 1.2))
    return Math.abs(depth) <= COURT.kitchen + 1 ? "dink" : "drop";
  return shotType(power, height, false);
}

/** Keep feet outside the kitchen and prioritize an incoming ball over recovery. */
export function assistedDepth(
  lastShot: Shot,
  receiving: boolean,
  ballDepth: number,
  bounced: boolean,
) {
  if (receiving) return clamp(ballDepth + (bounced ? 0 : 1), 2.4, 7.3);
  if (lastShot === "dink" || lastShot === "drop") return 2.6;
  if (lastShot === "lob" || lastShot === "drive" || lastShot === "smash")
    return 5.8;
  return 4.6;
}
