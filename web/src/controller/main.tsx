import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ART } from "../art-assets";
import { RIVALS } from "../game/ai";
import { useController } from "./use-controller";
import { ThumbControls } from "./thumb-controls";
import "../style.css";
import "./phone.css";

const art = ART as Record<string, { file: string }>;
function SettingsSheet({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="phone-settings"
      aria-label="Controller settings"
      onCancel={onClose}
    >
      <div className="phone-settings-heading">
        <h2>Your paddle</h2>
        <button onClick={onClose} autoFocus>
          Done
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Phone() {
  const c = useController();
  const [installHint, setInstallHint] = useState(() => {
    const standalone =
      matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone;
    try {
      return (
        /iP(hone|ad|od)/.test(navigator.userAgent) &&
        /Safari/.test(navigator.userAgent) &&
        !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent) &&
        !standalone &&
        !localStorage.getItem("dink-install-hint")
      );
    } catch {
      return false;
    }
  });
  const playing = c.joined && c.stage !== "welcome";
  const paused = c.stage === "ready" && c.paused;
  const status = !c.connected
    ? c.joined
      ? "Reconnecting…"
      : c.error
        ? "Disconnected"
        : c.room
          ? "Connecting…"
          : "Disconnected"
    : c.ping === undefined
      ? "Connected"
      : `${c.ping} ms`;
  const headline =
    c.stage === "practice"
      ? `Practice ${Math.min(c.count + 1, 3)} of 3.`
      : c.phase.phase === "matchover"
        ? "Good game!"
        : c.phase.phase === "serve"
          ? c.phase.serving === "player"
            ? "Your serve."
            : `${RIVALS[c.phase.rival ?? "pip"].name}’s serve.`
          : c.phase.phase === "rally"
            ? `Rally ${c.phase.rally}`
            : c.phase.message;
  return (
    <div
      className={`phone-app ${playing ? "is-controller" : ""} ${c.feedback ? `feedback-${c.feedback}` : ""}`}
    >
      <header className="phone-header">
        {playing ? (
          !paused ? (
            <button
              className="icon-button phone-pause"
              aria-label="Pause match"
              disabled={c.stage !== "ready" || !c.connected}
              onClick={c.pause}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14M16 5v14" />
              </svg>
            </button>
          ) : (
            <span className="toolbar-spacer" />
          )
        ) : (
          <a className="phone-brand" href="/">
            dink<span>duel.</span>
          </a>
        )}
        {playing && (
          <div
            className="phone-score"
            aria-label={`You ${c.phase.score[0]}, ${RIVALS[c.phase.rival ?? "pip"].name} ${c.phase.score[1]}`}
          >
            <span>
              YOU <b>{c.phase.score[0]}</b>
            </span>
            <i>:</i>
            <span>
              <b>{c.phase.score[1]}</b>{" "}
              {RIVALS[c.phase.rival ?? "pip"].name.toUpperCase()}
            </span>
          </div>
        )}
        <span
          className={`phone-connection ${c.ping !== undefined && c.ping > 150 ? "high-latency" : ""}`}
          role="status"
          title={c.connected ? `Court ${c.room}` : status}
        >
          <i className={`status-dot ${c.connected ? "" : "offline"}`} />
          <span>{status}</span>
        </span>
        {playing && !paused && (
          <button
            className="icon-button settings-trigger"
            aria-label="Settings"
            onClick={c.openSettings}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 3-.7 2.4-2.4 1L3.7 6l-1.5 2.6 1.6 1.8v2.8l-1.6 1.9 1.5 2.6 2.2-.5 2.4 1L9 21h3l.7-2.8 2.4-1 2.2.5 1.5-2.6-1.6-1.9v-2.8l1.6-1.8L17.3 6l-2.2.4-2.4-1L12 3Z" />
              <circle cx="10.5" cy="12" r="3" />
            </svg>
          </button>
        )}
      </header>
      <main className="phone-main">
        {!c.joined ? (
          <section className="phone-welcome">
            <div className="phone-eyebrow">JOIN A COURT</div>
            <h1>Got a court code?</h1>
            <p>Find the four-letter code on your game screen.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                c.join();
              }}
            >
              <label htmlFor="court-code">Court code</label>
              <input
                id="court-code"
                className="code-input"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={4}
                pattern="[A-HJ-KM-NP-Z]{4}"
                value={c.code}
                onChange={(e) =>
                  c.setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))
                }
                placeholder="ABCD"
                required
              />
              <button className="phone-primary" type="submit">
                Join the court →
              </button>
            </form>
          </section>
        ) : c.stage === "welcome" ? (
          <section className="phone-welcome paddle-welcome">
            <div className="welcome-copy">
              <div className="phone-eyebrow">YOUR PHONE. YOUR PADDLE.</div>
              <h1>
                Two thumbs.
                <br />
                One great rally.
              </h1>
              <p>
                Drag Aim. Tap Swing for a medium shot, or press to charge and
                release to hit. Swipe up on Swing for a lob. Your feet take care
                of themselves.
              </p>
              <p className="grip-notice">
                For motion play, use a firm grip or wrist strap and make three
                gentle practice swings.
              </p>
            </div>
            <div className="welcome-actions">
              <div
                className="phone-segment"
                role="group"
                aria-label="Paddle hand"
              >
                {(["right", "left"] as const).map((hand) => (
                  <button
                    key={hand}
                    aria-pressed={c.preferences.hand === hand}
                    onClick={() => c.updatePreferences({ hand })}
                  >
                    {hand === "right" ? "Right-handed" : "Left-handed"}
                  </button>
                ))}
              </div>
              <button
                className="phone-primary"
                onClick={() => void c.enableMotion()}
              >
                Tap to enable motion ↗
              </button>
              <button onClick={c.useTouch}>
                I’d rather use touch controls →
              </button>
              <p className="permission-note">
                Motion permission needed for tilt and swing.
              </p>
            </div>
            {installHint && (
              <aside className="install-hint">
                <p>
                  Add to Home Screen for full-screen play
                  <br />
                  <small>Safari → Share → Add to Home Screen</small>
                </p>
                <button
                  aria-label="Dismiss Home Screen hint"
                  onClick={() => {
                    setInstallHint(false);
                    try {
                      localStorage.setItem("dink-install-hint", "1");
                    } catch {
                      /* Optional. */
                    }
                  }}
                >
                  Got it
                </button>
              </aside>
            )}
          </section>
        ) : paused ? (
          <section className="paused-panel">
            <div className="phone-eyebrow">
              {c.connected ? "YOUR COURT IS WAITING" : "RECONNECTING"}
            </div>
            <h1>A little breather.</h1>
            <button
              className="phone-primary resume-button"
              aria-label="Resume match"
              disabled={!c.connected || c.phase.phase !== "paused"}
              onClick={c.pause}
            >
              Resume
            </button>
            <a href="/">Back to clubhouse</a>
          </section>
        ) : (
          <section
            className={`controller-play-panel ${c.motion ? "motion-play" : ""}`}
          >
            <div className="play-heading" aria-live="polite">
              <h1>{headline}</h1>
              {c.stage === "practice" && (
                <p>
                  {c.motion
                    ? "Three gentle forehand swings."
                    : "Tap Swing three times to warm up."}
                </p>
              )}
            </div>
            <ThumbControls
              motion={c.motion}
              leftHanded={c.preferences.hand === "left"}
              disabled={
                !c.connected || c.settings || c.phase.phase === "matchover"
              }
              lobChip={c.preferences.lobChip}
              visual={c.visual}
              paddle={art[`paddle-${c.preferences.skin}`]?.file}
              onAim={c.sendAim}
              onSwing={c.sendSwing}
            />
            {c.feedback && (
              <span
                className={`contact-result result-${c.feedback}`}
                role="status"
              >
                {c.feedback === "perfect"
                  ? "Perfect!"
                  : c.feedback === "fault"
                    ? "Out"
                    : c.feedback === "point"
                      ? "Your point"
                      : "Hit!"}
              </span>
            )}
            <div className="play-footnote" role="status">
              {!c.connected
                ? "Reconnecting · input paused"
                : c.sensorStatus ||
                  (c.ping !== undefined && c.ping > 150
                    ? "High latency · check your connection"
                    : c.motion
                      ? "Tilt to aim · swing to hit"
                      : c.stage === "practice"
                        ? "Swipe up on Swing for a lob"
                        : "")}
            </div>
          </section>
        )}
        {c.error && (
          <p className="phone-error" role="alert">
            {c.error}
          </p>
        )}
      </main>
      {c.settings && (
        <SettingsSheet onClose={() => c.setSettings(false)}>
          <div className="settings-options">
            <div>
              <label htmlFor="sensitivity">
                Sensitivity <b>{c.preferences.sensitivity.toFixed(1)}×</b>
              </label>
              <input
                id="sensitivity"
                type="range"
                min=".5"
                max="2"
                step=".1"
                value={c.preferences.sensitivity}
                onChange={(e) =>
                  c.updatePreferences({ sensitivity: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label>Paddle hand</label>
              <div className="phone-segment">
                {(["right", "left"] as const).map((hand) => (
                  <button
                    key={hand}
                    aria-pressed={c.preferences.hand === hand}
                    onClick={() => c.updatePreferences({ hand })}
                  >
                    {hand === "right" ? "Right" : "Left"}
                  </button>
                ))}
              </div>
            </div>
            <button
              role="switch"
              aria-checked={c.preferences.haptics}
              className="setting-toggle"
              onClick={() =>
                c.updatePreferences({ haptics: !c.preferences.haptics })
              }
            >
              Haptics <i aria-hidden="true" />
            </button>
            <button
              role="switch"
              aria-checked={c.preferences.lobChip}
              className="setting-toggle"
              onClick={() =>
                c.updatePreferences({ lobChip: !c.preferences.lobChip })
              }
            >
              Show Lob chip <i aria-hidden="true" />
            </button>
            <button onClick={c.recalibrate}>Recalibrate paddle</button>
            <button
              onClick={() => {
                if (c.motion) c.useTouch();
                else void c.enableMotion();
              }}
            >
              {c.motion ? "Use touch controls" : "Enable motion controls"}
            </button>
          </div>
          <div className="skin-picker" role="group" aria-label="Paddle skin">
            {[1, 2, 3, 4, 5, 6].map((skin) => (
              <button
                key={skin}
                aria-label={`Paddle skin ${skin}`}
                aria-pressed={c.preferences.skin === skin}
                onClick={() => c.updatePreferences({ skin })}
              >
                {art[`paddle-${skin}`] ? (
                  <img src={art[`paddle-${skin}`].file} alt="" />
                ) : (
                  skin
                )}
              </button>
            ))}
          </div>
          {c.error && (
            <p className="phone-error" role="alert">
              {c.error}
            </p>
          )}
        </SettingsSheet>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Phone />);
