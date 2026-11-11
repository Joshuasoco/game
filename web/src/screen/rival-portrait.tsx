import type { RivalId } from "../game/ai";
import { RIVALS } from "../game/ai";
import { ART } from "../art-assets";
const art = ART as Record<string, { file: string }>;
export function RivalPortrait({
  id,
  size = 56,
}: {
  id: RivalId;
  size?: number;
}) {
  return art[id] ? (
    <img
      className="rival-portrait"
      src={art[id].file}
      width={size}
      height={size}
      alt={`${RIVALS[id].name}, ${RIVALS[id].style}`}
      decoding="async"
    />
  ) : (
    <span
      className="portrait-fallback"
      style={{ width: size, height: size, background: RIVALS[id].color }}
      aria-hidden="true"
    >
      {RIVALS[id].name[0]}
    </span>
  );
}
