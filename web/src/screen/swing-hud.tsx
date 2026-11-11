import type { Snapshot } from "../game/engine";
import { COPY, READINESS } from "../game/readiness/config";
export function SwingHud({
  state,
  anchor,
  ringAnchor,
}: {
  state: Snapshot;
  anchor?: { x: number; y: number };
  ringAnchor?: { x: number; y: number };
}) {
  if (!state.readinessEnabled) return null;
  const snap = state.readiness;
  const prompt =
    state.phase === "serve" && state.serving === "player"
      ? COPY.serve
      : state.phase === "rally" && snap
        ? snap.state === "FAR" &&
          state.score[0] + state.score[1] >= READINESS.longHintPointsShown
          ? COPY.waiting
          : COPY.prompts[snap.state]
        : "";
  return (
    <>
      {prompt && (
        <div className="swing-status" data-state={snap?.state} role="status">
          {prompt}
        </div>
      )}
      {state.whiff && (
        <div
          className="whiff-toast"
          role="status"
          style={{ left: `${anchor?.x ?? 50}%`, top: `${anchor?.y ?? 65}%` }}
        >
          {state.whiff}
        </div>
      )}
      {state.practice?.hint && (
        <div
          className="practice-pointer"
          aria-hidden="true"
          style={{
            left: `${ringAnchor?.x ?? 50}%`,
            top: `${ringAnchor?.y ?? 70}%`,
          }}
        >
          ↓
        </div>
      )}
      {state.faultEvent && state.phase === "point" && (
        <div className="fault-card" role="status">
          <span aria-hidden="true">!</span>
          <strong>{COPY.faults[state.faultEvent.reason]}</strong>
        </div>
      )}
    </>
  );
}
export function Instructions({
  ringEnabled = true,
}: {
  ringEnabled?: boolean;
}) {
  const copy = COPY.instructions;
  return (
    <div className="swing-instructions">
      <p>
        <strong>{copy.model}</strong>
      </p>
      <p>{copy.intro}</p>
      <ol>
        {copy.steps.map((line, index) => (
          <li key={line}>
            {!ringEnabled && index === 1 ? copy.legacyWatch : line}
          </li>
        ))}
      </ol>
      <p>{ringEnabled ? copy.whiff : copy.legacyWhiff}</p>
      <p>
        <strong>{copy.lose}</strong>
      </p>
      <ul>
        {copy.faults.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p>{copy.scoring}</p>
      <table>
        <thead>
          <tr>
            {copy.headings.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {copy.controls.map((row, index) => (
            <tr key={row[0]}>
              {row.map((cell, column) => (
                <td key={cell}>
                  {!ringEnabled && index === 0 && column === 2
                    ? copy.legacyWhen
                    : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p>{ringEnabled ? copy.phone : copy.phoneBasics}</p>
    </div>
  );
}
