import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, type Socket } from "socket.io-client";
import QRCode from "qrcode";
import type { ClientEvents, ServerEvents, Difficulty } from "@dink/shared";
import { CourtScene } from "./scene";
import { Game, type Snapshot } from "../game/engine";
import { Icon } from "./icons";
import { RIVALS, type RivalId } from "../game/ai";
import "../style.css";
import "./game-ui.css";
const initial: Snapshot = {
  phase: "menu",
  score: [0, 0],
  serving: "player",
  rally: 0,
  message: "",
  best: 0,
  hits: 0,
  fps: 60,
  shot: "Ready",
  challenge: false,
  rival: "pip",
  timing: undefined,
  stats: {
    longestRally: 0,
    winners: 0,
    faults: 0,
    timingTotalMs: 0,
    timedSwings: 0,
  },
};
function App() {
  const canvas = useRef<HTMLDivElement>(null),
    game = useRef<Game | null>(null),
    socket = useRef<Socket<ServerEvents, ClientEvents> | null>(null);
  const [state, setState] = useState(initial),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [room, setRoom] = useState(""),
    [online, setOnline] = useState(false),
    [paired, setPaired] = useState(false);
  const [modal, setModal] = useState<"pair" | "help" | null>(null),
    [difficulty, setDifficulty] = useState<Difficulty>("medium"),
    [mode, setMode] = useState<"match" | "challenge">("match"),
    [qr, setQr] = useState(""),
    [base, setBase] = useState(location.origin),
    [muted, setMuted] = useState(false),
    [copied, setCopied] = useState(false),
    [theme, setTheme] = useState("park"),
    [unlocked, setUnlocked] = useState(false);
  const [rival, setRival] = useState<RivalId>("pip");
  const config = useRef({ difficulty, mode, rival });
  config.current = { difficulty, mode, rival };
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let g: Game | undefined;
    try {
      g = new Game(new CourtScene(canvas.current!), (s) => {
        setState(s);
        if (s.phase === "matchover" && s.winner === "player") setUnlocked(true);
      });
      game.current = g;
      g.onPhase = (p) => socket.current?.emit("game:phase", p);
      g.onHaptic = (kind) =>
        socket.current?.emit("haptic", {
          pattern:
            kind === "perfect"
              ? [12, 18, 25]
              : kind === "fault"
                ? [65]
                : kind === "point"
                  ? [20, 35, 20]
                  : [22],
        });
      void g
        .init()
        .then(() => {
          if (!cancelled) setReady(true);
        })
        .catch((e) => setError(String(e)));
    } catch (e) {
      setError(`WebGL could not start: ${String(e)}`);
    }
    try {
      setUnlocked(localStorage.getItem("dink-sunset") === "unlocked");
    } catch {
      /* Optional. */
    }
    return () => {
      cancelled = true;
      g?.dispose();
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
    s.on("controller:status", (d) => {
      setPaired(d.connected);
      if (!d.connected) game.current?.disconnect();
      else if (!d.resumed) {
        setModal("pair");
        game.current?.calibrate();
      }
    });
    s.on("input:calibration", () => {
      setModal(null);
      const g = game.current;
      if (g?.phase === "paused") g.pause();
      else if (
        g &&
        !["serve", "rally", "point", "matchover"].includes(g.phase)
      ) {
        g.setRival(config.current.rival);
        g.start(config.current.difficulty, config.current.mode === "challenge");
      }
    });
    s.on("input:swing", (d) => game.current?.input(d));
    s.on("input:pose", (d) => game.current?.pose(d.roll, d.intent));
    s.on("input:pause", () => game.current?.pause());
    s.on("net:ping", (d, ack) => ack({ ...d, tHost: Date.now() }));
    s.on("net:latency", (d) => game.current?.setLatency(d.rtt, d.offset));
    s.on("room:closed", (d) => {
      setPaired(false);
      setError(d.reason);
    });
    if (
      import.meta.env.DEV &&
      ["localhost", "127.0.0.1"].includes(location.hostname)
    )
      void fetch("/network")
        .then((r) => r.json())
        .then((d: { addresses: string[] }) => {
          if (d.addresses[0]) {
            const url = new URL(location.origin);
            url.hostname = d.addresses[0];
            setBase(url.origin);
          }
        })
        .catch(() => {});
    return () => {
      s.disconnect();
    };
  }, []);
  useEffect(() => {
    if (room)
      void QRCode.toDataURL(`${base}/c?room=${room}`, {
        width: 240,
        margin: 1,
        color: { dark: "#193f35", light: "#ffffff" },
      }).then(setQr);
  }, [room, base]);
  useEffect(() => {
    let seq = Date.now();
    const held = new Set<string>();
    const down = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      held.add(e.code);
      if (e.code === "ArrowUp" || e.code === "ArrowDown") {
        e.preventDefault();
        game.current?.positionIntent(held.has("ArrowUp") ? 1 : -1);
      }
      if (e.code === "Space" && !e.repeat && !modal) {
        e.preventDefault();
        game.current?.input({
          seq: ++seq,
          power: 0.64,
          side: "forehand",
          tilt: held.has("ArrowLeft") ? -0.8 : held.has("ArrowRight") ? 0.8 : 0,
          lob: held.has("ShiftLeft") || held.has("ShiftRight"),
          drop: held.has("KeyD"),
          spin: held.has("KeyX") ? -0.6 : 0.5,
          tPhone: Date.now(),
        });
      }
      if (e.code === "KeyP" && !modal) game.current?.pause();
      if (e.code === "Enter" && !modal) game.current?.skipTransition();
    };
    const up = (e: KeyboardEvent) => {
      held.delete(e.code);
      if (e.code === "ArrowUp" || e.code === "ArrowDown")
        game.current?.positionIntent(
          held.has("ArrowUp") ? 1 : held.has("ArrowDown") ? -1 : 0,
        );
    };
    const blur = () => held.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [modal]);
  const playing = !["menu", "waiting", "calibrate"].includes(state.phase);
  const close = () => {
    setModal(null);
    if (["waiting", "calibrate"].includes(game.current?.phase ?? ""))
      game.current?.menu();
  };
  useEffect(() => {
    if (!modal) return;
    const prior = document.activeElement as HTMLElement;
    dialog.current?.querySelector<HTMLElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const nodes = dialog.current?.querySelectorAll<HTMLElement>(
          "button,a,input,select",
        );
        if (!nodes?.length) return;
        const a = nodes[0],
          b = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      prior?.focus();
    };
  }, [modal]);
  const start = () => {
    setModal(null);
    game.current?.setRival(rival);
    game.current?.start(difficulty, mode === "challenge");
  };
  const pair = () => {
    if (paired) start();
    else {
      setModal("pair");
      game.current?.wait();
    }
  };
  const audioToggle = () => {
    setMuted(!muted);
    if (game.current) {
      game.current.audio.start();
      game.current.audio.muted = !muted;
    }
  };
  return (
    <div className={`game-app ${playing ? "in-match" : "at-title"}`}>
      <div ref={canvas} className="world-canvas" />
      {!ready && (
        <div className="boot-screen" role="status">
          <span className="spinner" />
          <h1>Opening the court.</h1>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
      {ready && !playing && (
        <div className="title-ui">
          <header className="studio-header">
            <a href="/" className="wordmark">
              dinkduel<span>.</span>
            </a>
            <div>
              <button className="text-button" onClick={() => setModal("help")}>
                How to play ?
              </button>
              <button
                className="icon-button"
                aria-label={muted ? "Turn sound on" : "Mute sound"}
                onClick={audioToggle}
              >
                <Icon name={muted ? "mute" : "sound"} />
              </button>
            </div>
          </header>
          <section className="title-card">
            <span className="eyebrow">EVERGREEN PICKLEBALL CLUB</span>
            <h1>Small court. Big energy.</h1>
            <p>
              Tilt to aim. Swing to hit.
              <br />
              Singles against a rival who always has time.
            </p>
            <div className="title-settings">
              <label>
                Rival
                <select
                  aria-label="Rival"
                  value={rival}
                  onChange={(e) => {
                    setRival(e.target.value as RivalId);
                  }}
                >
                  {(Object.keys(RIVALS) as RivalId[]).map((id) => (
                    <option key={id} value={id}>
                      {RIVALS[id].name} · {RIVALS[id].style}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Mode
                <select
                  aria-label="Game mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as typeof mode)}
                >
                  <option value="match">Quick match · first to 11</option>
                  <option value="challenge">Rally challenge</option>
                </select>
              </label>
              <label>
                Difficulty
                <select
                  aria-label="Opponent difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
            </div>
            <button
              className="primary-button"
              disabled={!online}
              onClick={pair}
            >
              <Icon name="phone" />
              Play with your phone
              <Icon name="arrow" />
            </button>
            <button className="keyboard-button" onClick={start}>
              <Icon name="keyboard" />
              Just looking? Try with your keyboard
            </button>
            <div className="title-record">
              <Icon name="trophy" size={15} />
              Best rally <b>{state.best}</b>
              <button
                onClick={() => {
                  if (!unlocked) {
                    setError("Win a match to unlock the sunset court.");
                    return;
                  }
                  const next = theme === "park" ? "sunset" : "park";
                  setTheme(next);
                  game.current?.scene.setTheme(next);
                }}
              >
                {theme === "park" ? "Day court" : "Sunset court"}
                {!unlocked ? " · sunset locked" : ""}
              </button>
            </div>
          </section>
          <span className="title-location">COURT 01 / EVERGREEN PARK</span>
          <span className="title-connection">
            <i className={`status-dot ${online ? "" : "offline"}`} />
            {paired
              ? "Paddle connected"
              : online
                ? "Court ready"
                : "Connecting…"}
          </span>
        </div>
      )}
      {playing && (
        <div className="match-ui">
          <div
            className="scoreboard"
            aria-label={`Score: you ${state.score[0]}, rival ${state.score[1]}`}
          >
            <div>
              <span className="player-dot coral" />
              YOU <b>{state.score[0]}</b>
            </div>
            <span className="score-divider">:</span>
            <div>
              <b>{state.score[1]}</b>
              {RIVALS[state.rival].name.toUpperCase()}{" "}
              <span className="player-dot lilac" />
            </div>
          </div>
          <span className="rally-counter">
            RALLY <b>{state.rally.toString().padStart(2, "0")}</b>
          </span>
          <div className="match-actions">
            <button
              className="icon-button"
              aria-label={muted ? "Turn sound on" : "Mute sound"}
              onClick={audioToggle}
            >
              <Icon name={muted ? "mute" : "sound"} />
            </button>
            <button
              className="icon-button"
              aria-label="Pause game"
              onClick={() => game.current?.pause()}
            >
              <Icon name="pause" />
            </button>
          </div>
          <div className="edge-toast" key={state.phase} role="status">
            {state.phase === "serve" ? (
              <>
                <h2>
                  {state.serving === "player"
                    ? "Your serve."
                    : `${RIVALS[state.rival].name}’s serve.`}
                </h2>
                <p>
                  {state.serving === "player"
                    ? "Swing or press Space."
                    : "Let the serve bounce."}
                </p>
              </>
            ) : state.phase === "point" ? (
              <>
                <h2>{state.message.split(" · ")[0]}</h2>
                <p>Fault: {state.message.split(" · ")[1]}</p>
                <button onClick={() => game.current?.skipTransition()}>
                  Next point ↵
                </button>
              </>
            ) : state.phase === "rally" ? (
              <p>{state.message}</p>
            ) : null}
          </div>
          <span className="control-hint">
            {paired
              ? "Phone connected · P to pause"
              : "SPACE hit · ← → aim · SHIFT lob · P pause"}
          </span>
          {state.phase === "paused" && (
            <div className="state-backdrop">
              <section
                className="result-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pause-title"
              >
                <span className="eyebrow">PAUSED</span>
                <h2 id="pause-title">A little breather.</h2>
                <p>{state.message}</p>
                <button
                  className="primary-button"
                  onClick={() => game.current?.pause()}
                >
                  Resume game <Icon name="play" />
                </button>
                <button
                  className="keyboard-button"
                  onClick={() => game.current?.menu()}
                >
                  Back to clubhouse
                </button>
              </section>
            </div>
          )}
          {state.phase === "matchover" && (
            <div className="state-backdrop">
              <section
                className="result-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="result-title"
              >
                <span className="eyebrow">MATCH RESULT</span>
                <h2 id="result-title">
                  {state.winner === "player"
                    ? "Your match."
                    : `${RIVALS[state.rival].name} takes it.`}
                </h2>
                <div className="final-score">
                  {state.score[0]} <span>—</span> {state.score[1]}
                </div>
                <dl className="result-stats">
                  <div>
                    <dt>Longest rally</dt>
                    <dd>{state.stats.longestRally}</dd>
                  </div>
                  <div>
                    <dt>Winners</dt>
                    <dd>{state.stats.winners}</dd>
                  </div>
                  <div>
                    <dt>Your faults</dt>
                    <dd>{state.stats.faults}</dd>
                  </div>
                  <div>
                    <dt>Average timing</dt>
                    <dd>
                      {state.stats.timedSwings
                        ? `${Math.round(state.stats.timingTotalMs / state.stats.timedSwings)} ms`
                        : "—"}
                    </dd>
                  </div>
                </dl>
                <p className="rival-quip">
                  “
                  {state.winner === "player"
                    ? RIVALS[state.rival].winQuip
                    : RIVALS[state.rival].lossQuip}
                  ” — {RIVALS[state.rival].name}
                </p>
                <button className="primary-button" onClick={start}>
                  Rematch <Icon name="arrow" />
                </button>
                <button
                  className="keyboard-button"
                  onClick={() => game.current?.menu()}
                >
                  Back to clubhouse
                </button>
              </section>
            </div>
          )}
        </div>
      )}
      {error && ready && (
        <div className="error-banner" role="alert">
          {error}
          <button aria-label="Dismiss message" onClick={() => setError("")}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {new URLSearchParams(location.search).has("debug") && (
        <div className="debug">
          {state.fps} FPS · phase {state.phase} · room {room} · swings{" "}
          {state.hits}
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            ref={dialog}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={close}
            >
              <Icon name="close" />
            </button>
            {modal === "pair" ? (
              <>
                <span className="eyebrow">PAIR A PADDLE</span>
                <h2 id="modal-title">Open your phone camera.</h2>
                <p>
                  {paired
                    ? "Connected. Take three practice swings on your phone."
                    : "Scan the code. Keep both devices on the same network."}
                </p>
                {qr ? (
                  <img
                    className="qr"
                    src={qr}
                    width="210"
                    height="210"
                    alt={`Join room ${room}`}
                  />
                ) : (
                  <p>Creating room…</p>
                )}
                <div className="room-code">{room || "••••"}</div>
                <a
                  className="join-link"
                  href={`${base}/c?room=${room}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {base.replace(/^https?:\/\//, "")}/c
                </a>
                <button
                  className="text-button copy-link"
                  onClick={() => {
                    if (!navigator.clipboard) {
                      setError("Copy the link above. Clipboard needs HTTPS.");
                      return;
                    }
                    void navigator.clipboard
                      .writeText(`${base}/c?room=${room}`)
                      .then(() => setCopied(true))
                      .catch(() => setError("Copy the link above."));
                  }}
                >
                  {copied ? "Copied" : "Copy invite link"}
                </button>
                {base.startsWith("http:") && (
                  <p className="pair-note">
                    HTTP supports touch controls. Motion requires HTTPS.
                  </p>
                )}
                <button className="keyboard-button" onClick={start}>
                  Try with your keyboard instead →
                </button>
              </>
            ) : (
              <>
                <span className="eyebrow">HOW TO PLAY</span>
                <h2 id="modal-title">Timing does the work.</h2>
                <ol className="help-steps">
                  <li>
                    <b>Pair.</b> Scan the code and take three gentle forehand
                    swings.
                  </li>
                  <li>
                    <b>Return.</b> Swing near the ball. Tilt left or right to
                    aim. Hold LOB for height.
                  </li>
                  <li>
                    <b>Wait for the bounce.</b> The serve and first return must
                    bounce. No volleys from the kitchen.
                  </li>
                </ol>
                <div className="keyboard-guide">
                  <p>
                    <kbd>Space</kbd> hit · <kbd>← →</kbd> aim
                    <br />
                    <kbd>Shift + Space</kbd> lob · <kbd>P</kbd> pause
                  </p>
                </div>
                <p>Rally scoring. First to 11, win by two.</p>
                <button className="primary-button" onClick={close}>
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
