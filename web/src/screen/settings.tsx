import { useEffect, useRef, useState } from "react";
import type { Game } from "../game/engine";
import type { AudioLevels } from "../game/audio";
export function Settings({
  game,
  onClose,
}: {
  game: Game;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [levels, setLevels] = useState({ ...game.audio.levels });
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      onCancel={onClose}
      onKeyDown={(e) => e.stopPropagation()}
      aria-labelledby="settings-title"
    >
      <div className="settings-heading">
        <h2 id="settings-title">Settings</h2>
        <button aria-label="Close settings" onClick={onClose}>
          ✕
        </button>
      </div>
      <h3>Audio</h3>
      {(["master", "sfx", "music", "ambience"] as (keyof AudioLevels)[]).map(
        (key) => (
          <label key={key} className="setting-row">
            <span>
              {key === "sfx"
                ? "Sound effects"
                : key[0].toUpperCase() + key.slice(1)}{" "}
              <b>{Math.round(levels[key] * 100)}%</b>
            </span>
            <input
              aria-label={`${key} volume`}
              type="range"
              min="0"
              max="1"
              step=".05"
              value={levels[key]}
              onChange={(e) => {
                const next = { ...levels, [key]: Number(e.target.value) };
                setLevels(next);
                game.audio.setLevels(next);
              }}
            />
          </label>
        ),
      )}
      <button
        className="secondary-button"
        onClick={() => {
          const next = { ...levels, master: levels.master ? 0 : 0.7 };
          setLevels(next);
          game.audio.setLevels(next);
        }}
      >
        {" "}
        {levels.master ? "Mute all audio" : "Restore audio"}
      </button>
      <p className="settings-note">
        Audio starts after your first tap. Set any channel to zero to mute it.
      </p>
      <button className="primary-button" onClick={onClose}>
        Done
      </button>
    </dialog>
  );
}
