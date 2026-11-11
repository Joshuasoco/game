import { useEffect, useRef, useState } from "react";
import type { Game } from "../game/engine";
import type { AudioLevels } from "../game/audio";
import {
  readClarityPreferences,
  saveClarityPreferences,
} from "../game/readiness/preferences";
import { COPY } from "../game/readiness/config";
import {
  readPreferences,
  savePreferences,
  type QualityPreference,
} from "../game/preferences";
export function Settings({
  game,
  onClose,
}: {
  game: Game;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [levels, setLevels] = useState({ ...game.audio.levels });
  const [preferences, setPreferences] = useState(readPreferences);
  const [clarity, setClarity] = useState(readClarityPreferences);
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
      <h3>Display</h3>
      <label className="setting-row">
        <span>Quality</span>
        <select
          aria-label="Graphics quality"
          value={preferences.quality}
          onChange={(e) => {
            const next = {
              ...preferences,
              quality: e.target.value as QualityPreference,
            };
            setPreferences(next);
            savePreferences(next);
            game.scene.setQuality(next.quality);
          }}
        >
          <option value="auto">Auto · adapts to your device</option>
          <option value="low">Low · no shadows or particles</option>
          <option value="medium">Medium · balanced</option>
          <option value="high">High · full effects</option>
        </select>
      </label>
      <label className="setting-check">
        <input
          type="checkbox"
          checked={preferences.reducedMotion}
          onChange={(e) => {
            const next = { ...preferences, reducedMotion: e.target.checked };
            setPreferences(next);
            savePreferences(next);
            game.scene.setReducedMotion(next.reducedMotion);
          }}
        />
        Reduce motion
      </label>
      <h3>Audio</h3>
      {(["swingCue", "highContrast", "minimal", "hideOnHard"] as const).map(
        (key) => (
          <label className="setting-check" key={key}>
            <input
              type="checkbox"
              checked={clarity[key]}
              onChange={(e) => {
                const next = { ...clarity, [key]: e.target.checked };
                setClarity(next);
                saveClarityPreferences(next);
                game.refreshClarity();
              }}
            />
            {
              COPY.settings[
                (
                  {
                    swingCue: "cue",
                    highContrast: "contrast",
                    minimal: "minimal",
                    hideOnHard: "hard",
                  } as const
                )[key]
              ]
            }
          </label>
        ),
      )}
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
      <h3>Local tuning data</h3>
      <label className="setting-check">
        <input
          type="checkbox"
          checked={preferences.analytics}
          onChange={(e) => {
            const next = { ...preferences, analytics: e.target.checked };
            setPreferences(next);
            savePreferences(next);
            game.metrics.enabled = next.analytics;
          }}
        />
        Allow anonymous counters on this device
      </label>
      <p className="settings-note">
        Off by default. Counts hits, timing grades and faults. No network
        requests or device identifiers.
      </p>
      <button className="text-button" onClick={() => game.metrics.clear()}>
        Clear local counters
      </button>
      <button className="primary-button" onClick={onClose}>
        Done
      </button>
    </dialog>
  );
}
