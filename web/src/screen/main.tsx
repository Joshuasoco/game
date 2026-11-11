import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, type Socket } from "socket.io-client";
import QRCode from "qrcode";
import type { ClientEvents, ServerEvents, Difficulty } from "@dink/shared";
import { CourtScene } from "./scene";
import { Game, type Snapshot } from "../game/engine";
import "../style.css";
type IconName =
  | "paddle"
  | "phone"
  | "arrow"
  | "sound"
  | "mute"
  | "close"
  | "expand"
  | "pause"
  | "play"
  | "check"
  | "trophy"
  | "keyboard"
  | "sun"
  | "link";
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    paddle: (
      <>
        <path d="M15.5 3.5c3.5 3.5 2 7.5-1 10.5s-6 3-9 0-3-6 0-9 6.5-5 10-1.5Z" />
        <path d="m6 14-4 5 3 3 5-5M9 6l5 5M6 9l5 5" />
      </>
    ),
    phone: (
      <>
        <rect x="6" y="2" width="12" height="20" rx="3" />
        <path d="M10 5h4m-3 14h2" />
      </>
    ),
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    sound: (
      <>
        <path d="m11 4-6 5H2v6h3l6 5V4Z" />
        <path d="M15 8q4 4 0 8m3-11q7 7 0 14" />
      </>
    ),
    mute: (
      <>
        <path d="m11 4-6 5H2v6h3l6 5V4Z" />
        <path d="m16 9 6 6m0-6-6 6" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    expand: <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />,
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    play: <path d="m8 4 12 8-12 8Z" />,
    check: <path d="m5 12 4 4L20 5" />,
    trophy: (
      <>
        <path d="M7 3h10v7a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 3v5m-4 1h8" />
      </>
    ),
    keyboard: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="3" />
        <path d="M5 9h1m3 0h1m3 0h1m3 0h1M5 12h1m3 0h1m3 0h1m3 0h1M7 16h10" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
      </>
    ),
    link: (
      <>
        <path
          d="m10 14 4-4m-6 6-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 2 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"
          transform="translate(1 -1)"
        />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
const initial: Snapshot = {
  phase: "menu",
  score: [0, 0],
  serving: "player",
  rally: 0,
  message: "",
  best: 0,
  hits: 0,
  fps: 60,
  shot: "Ready to rally",
  challenge: false,
};
function App() {
  const canvas = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const socket = useRef<Socket<ServerEvents, ClientEvents> | null>(null);
  const [state, setState] = useState(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [room, setRoom] = useState("");
  const [online, setOnline] = useState(false);
  const [paired, setPaired] = useState(false);
  const [modal, setModal] = useState<"pair" | "help" | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [mode, setMode] = useState<"match" | "challenge">("match");
  const [qr, setQr] = useState("");
  const [base, setBase] = useState(location.origin);
  const [muted, setMuted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState("park");
  const [themeUnlocked, setThemeUnlocked] = useState(false);
  const config = useRef({ difficulty, mode });
  config.current = { difficulty, mode };
  const modalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let instance: Game | undefined;
    try {
      const scene = new CourtScene(canvas.current!);
      instance = new Game(scene, (s) => {
        setState(s);
        if (s.phase === "matchover" && s.winner === "player")
          setThemeUnlocked(true);
      });
      game.current = instance;
      instance
        .init()
        .then(() => {
          if (!cancelled) setReady(true);
        })
        .catch((e) => setError(`Could not load the game: ${String(e)}`));
    } catch (e) {
      setError(`3D could not start. Check that WebGL is enabled. ${String(e)}`);
    }
    try {
      setThemeUnlocked(localStorage.getItem("dink-sunset") === "unlocked");
    } catch {
      /* Optional storage. */
    }
    return () => {
      cancelled = true;
      instance?.dispose();
      game.current = null;
    };
  }, []);
  useEffect(() => {
    const s = io({ transports: ["websocket"] });
    socket.current = s;
    s.on("connect", () => {
      setOnline(true);
      s.emit("host:create", ({ roomCode }: { roomCode: string }) =>
        setRoom(roomCode),
      );
    });
    s.on("disconnect", () => {
      setOnline(false);
      setPaired(false);
      game.current?.disconnect();
    });
    s.on("connect_error", () => setOnline(false));
    s.on("controller:status", ({ connected, resumed }) => {
      setPaired(connected);
      if (!connected) {
        game.current?.disconnect();
        return;
      }
      if (resumed) {
        /* Resume after the paddle confirms it is ready. */
      } else {
        setModal("pair");
        game.current?.calibrate();
      }
    });
    s.on("input:calibration", () => {
      setModal(null);
      const g = game.current;
      if (g?.phase === "paused") {
        g.pause();
        return;
      }
      if (g && ["serve", "rally", "point", "matchover"].includes(g.phase))
        return;
      const c = config.current;
      g?.start(c.difficulty, c.mode === "challenge");
    });
    s.on("input:swing", (input) => game.current?.input(input));
    s.on("input:pose", (p) => game.current?.pose(p.roll));
    s.on("input:pause", () => game.current?.pause());
    s.on("net:ping", (d, ack) => ack({ ...d, tHost: Date.now() }));
    s.on("net:latency", (d) => game.current?.setLatency(d.rtt, d.offset));
    s.on("room:closed", (d) => {
      setPaired(false);
      setError(d.reason);
    });
    const g = game.current;
    if (g) {
      g.onHaptic = () => s.emit("haptic", { pattern: [25] });
      g.onPhase = (p) => s.emit("game:phase", p);
    }
    if (
      import.meta.env.DEV &&
      ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
    ) {
      fetch("/network")
        .then((r) => r.json())
        .then((d: { addresses: string[] }) => {
          if (d.addresses[0]) {
            const url = new URL(location.origin);
            url.hostname = d.addresses[0];
            setBase(url.origin);
          }
        })
        .catch(() => {});
    }
    return () => {
      s.disconnect();
      socket.current = null;
    };
  }, []);
  useEffect(() => {
    if (room)
      QRCode.toDataURL(`${base}/controller.html?room=${room}`, {
        width: 240,
        margin: 1,
        color: { dark: "#173e36", light: "#ffffff" },
        errorCorrectionLevel: "M",
      })
        .then(setQr)
        .catch(() =>
          setError("Could not draw the QR code. Use the room code to join."),
        );
  }, [room, base]);
  useEffect(() => {
    let seq = Date.now();
    const keys = new Set<string>();
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      keys.add(e.code);
      if (e.code === "Space" && !e.repeat && !modal) {
        e.preventDefault();
        game.current?.input({
          seq: ++seq,
          power: 0.64,
          side: "forehand",
          tilt: keys.has("ArrowLeft") ? -0.8 : keys.has("ArrowRight") ? 0.8 : 0,
          lob: keys.has("ShiftLeft") || keys.has("ShiftRight"),
          tPhone: Date.now(),
        });
      }
      if (e.code === "KeyP" && !modal) game.current?.pause();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", () => keys.clear());
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", up);
    };
  }, [modal]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement;
    modalRef.current?.querySelector<HTMLElement>("button")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        if (["waiting", "calibrate"].includes(game.current?.phase ?? ""))
          game.current?.menu();
      }
      if (e.key === "Tab") {
        const items =
          modalRef.current?.querySelectorAll<HTMLElement>("button, a, input");
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [modal]);
  const playing = !["menu", "waiting", "calibrate"].includes(state.phase);
  const startKeyboard = () => {
    setModal(null);
    game.current?.start(difficulty, mode === "challenge");
  };
  const startPhone = () => {
    if (paired) {
      game.current?.start(difficulty, mode === "challenge");
      return;
    }
    setModal("pair");
    game.current?.wait();
  };
  const closeModal = () => {
    setModal(null);
    if (["waiting", "calibrate"].includes(state.phase)) game.current?.menu();
  };
  return (
    <div className="app">
      <header className="header">
        <a className="brand" href="/" aria-label="Dink Duel home">
          <span className="brand-icon">
            <Icon name="paddle" size={25} />
          </span>
          <span>
            dink<span className="brand-light">duel</span>
            <span className="brand-dot">.</span>
          </span>
        </a>
        <span className="header-note">A LITTLE FRIENDLY COMPETITION</span>
        <div className="header-actions">
          <button className="text-button" onClick={() => setModal("help")}>
            How to play <span className="help-circle">?</span>
          </button>
          <button
            className="icon-button"
            aria-label={muted ? "Turn sound on" : "Mute sound"}
            onClick={() => {
              const value = !muted;
              setMuted(value);
              if (game.current) {
                game.current.audio.muted = value;
                game.current.audio.start();
              }
            }}
          >
            <Icon name={muted ? "mute" : "sound"} />
          </button>
        </div>
      </header>
      <main>
        <div className="page-title">
          <div>
            <div className="eyebrow">
              <span className="tiny-line" />
              PICKLEBALL, WITH A TWIST
            </div>
            <h1>
              {playing ? "Find your rhythm." : "Small court. Big energy."}
            </h1>
            <p>
              {playing
                ? "A soft touch, a big swing. Make the next one yours."
                : "Your phone is the paddle. Your living room is courtside."}
            </p>
          </div>
          <div className="club-stamp">
            <Icon name="sun" size={19} />
            <span>
              GOOD TIMES.
              <br />
              <b>GREAT RALLIES.</b>
            </span>
          </div>
        </div>
        {error && (
          <div role="alert" className="error-banner">
            {error}
            <button aria-label="Dismiss message" onClick={() => setError("")}>
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        <div className={`game-layout ${playing ? "is-playing" : ""}`}>
          <section className="court-card" aria-label="Game court">
            <div ref={canvas} className="court-canvas" />
            <div className="court-top">
              <span className="location-chip">
                <span className="status-dot" />
                EVERGREEN PARK <span className="chip-divider">/</span> COURT 01
              </span>
              <button
                className="glass-icon"
                aria-label="Change camera angle"
                onClick={() => game.current?.scene.toggleCamera()}
              >
                <Icon name="expand" size={17} />
              </button>
            </div>
            {playing && (
              <div className="scoreboard">
                <div>
                  <span className="player-dot coral" />
                  YOU <b>{state.score[0]}</b>
                </div>
                <span className="score-divider">:</span>
                <div>
                  <b>{state.score[1]}</b>PIP{" "}
                  <span className="player-dot lilac" />
                </div>
              </div>
            )}
            {!ready && !error && (
              <div className="scene-loading">
                <span className="spinner" />
                Getting the court ready…
              </div>
            )}
            {playing && state.phase === "serve" && (
              <div className="game-prompt">
                <span className="mini-eyebrow">
                  {state.serving === "player"
                    ? "YOU’RE UP"
                    : "ON THE OTHER SIDE"}
                </span>
                <h2>
                  {state.serving === "player" ? "Your serve." : "Pip’s serve."}
                </h2>
                <p>
                  {state.serving === "player"
                    ? "Swing your phone or press Space"
                    : "Get ready for the return"}
                </p>
              </div>
            )}
            {playing && state.phase === "point" && (
              <div className="game-prompt point-prompt">
                <span className="mini-eyebrow">
                  {state.challenge ? "KEEP IT GOING" : "A MOMENT TO RESET"}
                </span>
                <h2>{state.message.split(" · ")[0]}.</h2>
                <p>{state.message.split(" · ")[1]}</p>
              </div>
            )}
            {state.phase === "paused" && (
              <div className="game-overlay">
                <span className="overlay-icon">
                  <Icon name="pause" size={28} />
                </span>
                <h2>A little breather.</h2>
                <p>{state.message}</p>
                <button
                  className="primary-button"
                  onClick={() => game.current?.pause()}
                >
                  <Icon name="play" />
                  Resume game
                </button>
                <button
                  className="text-button"
                  onClick={() => game.current?.menu()}
                >
                  Back to clubhouse
                </button>
              </div>
            )}
            {state.phase === "matchover" && (
              <div className="game-overlay">
                <span className="overlay-icon">
                  <Icon name="trophy" size={32} />
                </span>
                <div className="eyebrow">THAT’S A WRAP</div>
                <h2>
                  {state.winner === "player"
                    ? "You’ve got game."
                    : "Good game, good vibes."}
                </h2>
                <p>
                  {state.score[0]} — {state.score[1]} · Best rally: {state.best}
                </p>
                {state.winner === "player" && (
                  <p className="unlock-note">
                    Sunset court unlocked. A win looks good on you.
                  </p>
                )}
                <button className="primary-button" onClick={startKeyboard}>
                  One more game <Icon name="arrow" />
                </button>
                <button
                  className="text-button"
                  onClick={() => game.current?.menu()}
                >
                  Back to clubhouse
                </button>
              </div>
            )}
            <div className="court-bottom">
              <span>
                <i className="player-dot coral" />
                You <small>THE HUMAN</small>
              </span>
              <span className="court-bottom-center">
                {playing
                  ? `${state.rally} SHOT RALLY`
                  : "20 × 44 FT OF POSSIBILITY"}
              </span>
              <span>
                <i className="player-dot lilac" />
                Pip <small>THE FRIENDLY RIVAL</small>
              </span>
            </div>
          </section>
          <aside className="play-panel">
            {!playing ? (
              <>
                <span className="panel-eyebrow">
                  <span className="status-dot" />
                  {paired ? "PADDLE CONNECTED" : "THE COURT IS YOURS"}
                </span>
                <h2>
                  A good day
                  <br />
                  for a little <em>dink.</em>
                </h2>
                <p className="panel-intro">
                  Meet Pip. Your always-up-for-a-game rival. Grab your phone and
                  get a rally going.
                </p>
                <div className="panel-rule" />
                <label className="field-label">MAKE IT YOUR GAME</label>
                <div
                  className="mode-toggle"
                  role="group"
                  aria-label="Game mode"
                >
                  <button
                    className={mode === "match" ? "selected" : ""}
                    onClick={() => setMode("match")}
                  >
                    <Icon name="paddle" size={17} />
                    Quick match
                  </button>
                  <button
                    className={mode === "challenge" ? "selected" : ""}
                    onClick={() => setMode("challenge")}
                  >
                    <Icon name="trophy" size={16} />
                    Rally challenge
                  </button>
                </div>
                <div className="difficulty-label">
                  <label className="field-label">A LITTLE COMPETITION</label>
                  <span>
                    {difficulty === "easy"
                      ? "Keep it easy"
                      : difficulty === "medium"
                        ? "A fair challenge"
                        : "Bring your A-game"}
                  </span>
                </div>
                <div
                  className="difficulty-toggle"
                  role="group"
                  aria-label="Opponent difficulty"
                >
                  {(["easy", "medium", "hard"] as const).map((d, i) => (
                    <button
                      key={d}
                      aria-pressed={difficulty === d}
                      className={difficulty === d ? "selected" : ""}
                      onClick={() => setDifficulty(d)}
                    >
                      <span className="level-bars">
                        {[0, 1, 2].map((j) => (
                          <i key={j} className={j <= i ? "filled" : ""} />
                        ))}
                      </span>
                      {d}
                    </button>
                  ))}
                </div>
                <div className="mode-note">
                  {mode === "match"
                    ? "First to 11. Win by 2. Bragging rights included."
                    : "How long can you keep it going? Beat your best rally."}
                </div>
                <button
                  className="primary-button"
                  onClick={startPhone}
                  disabled={!ready || !online}
                >
                  <Icon name="phone" />
                  {paired ? "Step onto the court" : "Play with your phone"}
                  <Icon name="arrow" size={19} />
                </button>
                <button
                  className="keyboard-button"
                  disabled={!ready}
                  onClick={startKeyboard}
                >
                  <Icon name="keyboard" size={17} />
                  Just looking? Try with your keyboard{" "}
                  <Icon name="arrow" size={15} />
                </button>
                <div className="no-install">
                  <Icon name="check" size={13} />
                  No app. No downloads. Just play.
                </div>
              </>
            ) : (
              <>
                <span className="panel-eyebrow">
                  <span className="status-dot" />
                  {state.challenge ? "RALLY CHALLENGE" : "QUICK MATCH"} ·{" "}
                  {difficulty.toUpperCase()}
                </span>
                <h2>
                  One more
                  <br />
                  <em>good rally.</em>
                </h2>
                <p className="panel-intro" role="status">
                  {state.message}
                </p>
                <div className="match-stat">
                  <span>Current rally</span>
                  <b>{state.rally.toString().padStart(2, "0")}</b>
                </div>
                <div className="match-stat">
                  <span>Personal best</span>
                  <b>{state.best.toString().padStart(2, "0")}</b>
                </div>
                <div className="match-stat small">
                  <span>Last shot</span>
                  <b>{state.shot}</b>
                </div>
                <div className="input-hint">
                  <Icon name={paired ? "phone" : "keyboard"} size={22} />
                  <div>
                    <b>
                      {paired ? "Your phone is your paddle" : "Space to swing"}
                    </b>
                    <span>
                      {paired
                        ? "Swing to hit · hold LOB to go high"
                        : "← → to aim · Shift + Space to lob"}
                    </span>
                  </div>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => game.current?.pause()}
                  disabled={state.phase === "matchover"}
                >
                  <Icon name="pause" size={17} />
                  {state.phase === "paused" ? "Resume game" : "Pause game"}
                </button>
                <button
                  className="keyboard-button"
                  onClick={() => game.current?.menu()}
                >
                  Back to clubhouse
                </button>
              </>
            )}
          </aside>
        </div>
        <div className="below-court">
          <div className="feature">
            <span className="feature-icon">
              <Icon name="phone" size={23} />
            </span>
            <div>
              <b>Your phone. Your paddle.</b>
              <span>Scan, swing, and find your sweet spot.</span>
            </div>
            <span className="feature-number">01</span>
          </div>
          <div className="feature">
            <span className="feature-icon">
              <Icon name="paddle" size={23} />
            </span>
            <div>
              <b>All feel. No fuss.</b>
              <span>We handle the footwork. You make the shots.</span>
            </div>
            <span className="feature-number">02</span>
          </div>
          <div className="feature">
            <span className="feature-icon">
              <Icon name="trophy" size={23} />
            </span>
            <div>
              <b>Just one more rally.</b>
              <span>A friendly match. A new personal best.</span>
            </div>
            <span className="feature-number">03</span>
          </div>
        </div>
        <footer>
          <span>
            MADE FOR THE LOVE OF THE GAME <span className="footer-ball">✳</span>
          </span>
          <div>
            <button
              className="footer-theme"
              onClick={() => {
                if (themeUnlocked) {
                  const t = theme === "park" ? "sunset" : "park";
                  setTheme(t);
                  game.current?.scene.setTheme(t);
                } else setError("Win a match to unlock the sunset court.");
              }}
            >
              <Icon name="sun" size={14} />
              {theme === "park" ? "Evergreen edition" : "Sunset edition"}
              {!themeUnlocked && " · Win to unlock sunset"}
            </button>
            <span className="connection">
              <span className={`status-dot ${online ? "" : "offline"}`} />
              {online
                ? paired
                  ? "Paddle connected"
                  : "Ready when you are"
                : "Connecting to relay…"}
            </span>
          </div>
        </footer>
        {new URLSearchParams(location.search).has("debug") && (
          <div className="debug">
            {state.fps} FPS · phase {state.phase} · room {room} · swings{" "}
            {state.hits}
          </div>
        )}
      </main>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            ref={modalRef}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="modal-close icon-button"
              onClick={closeModal}
              aria-label="Close dialog"
            >
              <Icon name="close" />
            </button>
            {modal === "pair" ? (
              <>
                <span className="modal-icon">
                  <Icon name="phone" size={29} />
                </span>
                <div className="eyebrow">YOUR PHONE IS THE PADDLE</div>
                <h2 id="modal-title">Let’s get you courtside.</h2>
                <p>
                  {paired
                    ? "Phone connected. Follow the three practice swings on your phone."
                    : "Open your camera and scan the code below. We’ll meet you on your phone."}
                </p>
                {qr ? (
                  <img
                    className="qr"
                    src={qr}
                    width="210"
                    height="210"
                    alt={`Join room ${room} from your phone`}
                  />
                ) : (
                  <div className="qr-placeholder">
                    {online ? "Drawing your QR…" : "Connecting to the relay…"}
                  </div>
                )}
                <div className="room-code" aria-label={`Room code ${room}`}>
                  {room || "••••"}
                </div>
                <span className="room-caption">
                  YOUR FOUR-LETTER COURT CODE
                </span>
                <a
                  className="join-link"
                  href={`${base}/controller.html?room=${room}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {base.replace(/^https?:\/\//, "")}/c{" "}
                  <Icon name="arrow" size={14} />
                </a>
                <button
                  className="copy-link text-button"
                  onClick={() => {
                    if (!navigator.clipboard) {
                      setError(
                        "Clipboard unavailable. Open or copy the invite link in the pairing dialog.",
                      );
                      return;
                    }
                    navigator.clipboard
                      .writeText(`${base}/controller.html?room=${room}`)
                      .then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      })
                      .catch(() =>
                        setError(
                          "Clipboard unavailable. Open or copy the link above.",
                        ),
                      );
                  }}
                >
                  <Icon name="link" size={14} />
                  {copied ? "Link copied" : "Copy invite link"}
                </button>
                {base.startsWith("http:") && (
                  <div className="pair-note">
                    Same Wi-Fi for local play. Touch controls work here; motion
                    controls need an HTTPS link. See the README for setup.
                  </div>
                )}
                <button className="keyboard-button" onClick={startKeyboard}>
                  Try with your keyboard instead <Icon name="arrow" size={15} />
                </button>
              </>
            ) : (
              <>
                <div className="eyebrow">A QUICK COURTSIDE BRIEFING</div>
                <h2 id="modal-title">A little swing goes a long way.</h2>
                <div className="help-steps">
                  <div>
                    <span>01</span>
                    <p>
                      <b>Pair your paddle.</b>Scan the QR code with your phone,
                      choose your hand, and take three easy practice swings.
                    </p>
                  </div>
                  <div>
                    <span>02</span>
                    <p>
                      <b>Find your feel.</b>Swing to hit. Tilt left or right to
                      aim. Hold LOB for a high, deep return. Your character
                      moves automatically.
                    </p>
                  </div>
                  <div>
                    <span>03</span>
                    <p>
                      <b>Keep it in play.</b>Serve diagonally beyond the
                      kitchen. The serve and return must bounce before volleys.
                      Stay out of the kitchen when volleying.
                    </p>
                  </div>
                </div>
                <div className="keyboard-guide">
                  <Icon name="keyboard" />
                  <p>
                    <b>No phone? No problem.</b>
                    <br />
                    <kbd>Space</kbd> swing · <kbd>←</kbd> <kbd>→</kbd> aim
                    <br />
                    <kbd>Shift + Space</kbd> lob · <kbd>P</kbd> pause
                  </p>
                </div>
                <p className="help-score">
                  Rally scoring to 11, win by 2. Every rally earns a point.
                </p>
                <button className="primary-button" onClick={closeModal}>
                  Got it. Let’s play. <Icon name="arrow" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
