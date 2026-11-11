import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, type Socket } from "socket.io-client";
import type {
  ClientEvents,
  ServerEvents,
  GamePhase,
  JoinResult,
} from "@dink/shared";
import { SwingDetector, type DetectedSwing } from "./swing";
import { clamp } from "../game/solver";
import { ART } from "../art-assets";
import { RIVALS } from "../game/ai";
const art = ART as Record<string, { file: string }>;
import "../style.css";
import "./phone.css";
type PermissionEvent = {
  requestPermission?: () => Promise<"granted" | "denied">;
};
function Phone() {
  const initialRoom =
    new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";
  const [code, setCode] = useState(initialRoom);
  const [activeRoom, setActiveRoom] = useState(initialRoom);
  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState<"welcome" | "practice" | "ready">(
    "welcome",
  );
  const [hand, setHand] = useState<"right" | "left">("right");
  const [touch, setTouch] = useState(false);
  const [count, setCount] = useState(0);
  const [lob, setLob] = useState(false);
  const [aim, setAim] = useState(0);
  const [ping, setPing] = useState<number>();
  const [power, setPower] = useState(0.65);
  const [sensitivity, setSensitivity] = useState(1);
  const [flash, setFlash] = useState(false);
  const [phase, setPhase] = useState<GamePhase>({
    phase: "waiting",
    score: [0, 0],
    rally: 0,
    serving: "player",
    message: "",
  });
  const [sensorStatus, setSensorStatus] = useState("");
  const [skin, setSkin] = useState(() => {
    try {
      return clamp(Number(localStorage.getItem("dink-skin")) || 1, 1, 6);
    } catch {
      return 1;
    }
  });
  const [liveRoll, setLiveRoll] = useState(0),
    [strength, setStrength] = useState(0),
    [settingsOpen, setSettingsOpen] = useState(false),
    [intent, setIntent] = useState(0),
    [drop, setDrop] = useState(false);
  const dropRef = useRef(false),
    intentRef = useRef(0),
    press = useRef<{ at: number; x: number } | null>(null),
    neutralPitch = useRef(0);
  const socket = useRef<Socket<ServerEvents, ClientEvents> | null>(null);
  const detector = useRef(new SwingDetector());
  const samples = useRef<DetectedSwing[]>([]);
  const seq = useRef(Date.now());
  const neutral = useRef(0);
  const lobRef = useRef(false);
  const stageRef = useRef(stage);
  const touchRef = useRef(touch);
  touchRef.current = touch;
  stageRef.current = stage;
  const handRef = useRef(hand);
  handRef.current = hand;
  const cleanupSensors = useRef<() => void>(() => {});
  const session = useRef<{ roomCode: string; playerId: string } | null>(null);
  const wake = useRef<WakeLockSentinel | null>(null);
  const hasStarted = useRef(false);
  const lastMotion = useRef(0);
  const localSwingFeedback = () => {
    navigator.vibrate?.(8);
    setFlash(true);
    setTimeout(() => setFlash(false), 70);
  };
  const sendIntent = (value: number) => {
    intentRef.current = value;
    setIntent(value);
    if (socket.current?.connected)
      socket.current.volatile.emit("input:pose", {
        seq: ++seq.current,
        pitch: 0,
        roll: liveRoll,
        intent: value,
      });
  };
  useEffect(() => {
    const value = /Android/i.test(navigator.userAgent) ? 0.8 : 1;
    detector.current.sensitivity = value;
    setSensitivity(value);
  }, []);
  useEffect(() => {
    lobRef.current = lob;
  }, [lob]);
  useEffect(() => {
    if (!activeRoom) return;
    const s = io({ transports: ["websocket"] });
    socket.current = s;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(`dink-session-${activeRoom}`) ?? "null",
      );
      if (saved?.roomCode === activeRoom && saved?.playerId)
        session.current = saved;
    } catch {
      /* Session storage is optional. */
    }
    const result = (r: JoinResult) => {
      if (r.ok) {
        session.current = { roomCode: activeRoom, playerId: r.playerId };
        try {
          sessionStorage.setItem(
            `dink-session-${activeRoom}`,
            JSON.stringify(session.current),
          );
        } catch {
          /* Optional. */
        }
        setConnected(true);
        setJoined(true);
        setError("");
        if (stageRef.current === "ready")
          s.emit("input:calibration", {
            hand: handRef.current,
            swingSign: detector.current.swingSign,
          });
      } else {
        setError(r.error);
        session.current = null;
        try {
          sessionStorage.removeItem(`dink-session-${activeRoom}`);
        } catch {
          /* Optional. */
        }
        setJoined(false);
      }
    };
    s.on("connect", () => {
      if (session.current) s.emit("controller:resume", session.current, result);
      else s.emit("controller:join", { roomCode: activeRoom }, result);
    });
    s.on("disconnect", () => {
      setConnected(false);
      setSensorStatus(
        "Connection dropped. Your match is paused while we reconnect.",
      );
    });
    s.on("connect_error", () => {
      setConnected(false);
      setError("Can’t reach the court. Check your Wi-Fi and the game screen.");
    });
    s.on("game:phase", (p) => {
      setPhase(p);
      if (p.phase === "calibrate" && stageRef.current === "ready") {
        s.emit("input:calibration", {
          hand: handRef.current,
          swingSign: detector.current.swingSign,
        });
      }
    });
    s.on("haptic", ({ pattern }) => {
      navigator.vibrate?.(pattern);
      setFlash(true);
      setTimeout(() => setFlash(false), 120);
    });
    s.on("room:closed", ({ reason }) => {
      setError(reason);
      setConnected(false);
      setJoined(false);
      session.current = null;
      s.disconnect();
    });
    const interval = setInterval(() => {
      if (!s.connected || !session.current) return;
      const start = Date.now();
      s.timeout(1500).emit(
        "net:ping",
        { tPhone: start },
        (err: Error | null, reply: { tPhone: number; tHost: number }) => {
          if (err || !reply) return;
          const rtt = Date.now() - start;
          const offset = reply.tHost - (start + rtt / 2);
          setPing(Math.round(rtt));
          s.emit("net:latency", { rtt, offset });
        },
      );
      if (
        hasStarted.current &&
        Date.now() - lastMotion.current > 3500 &&
        stageRef.current !== "welcome" &&
        !touchRef.current
      )
        setSensorStatus(
          "No motion readings yet. Use touch mode if this browser does not provide sensors.",
        );
    }, 2000);
    return () => {
      clearInterval(interval);
      s.disconnect();
    };
  }, [activeRoom]);
  const requestWake = async () => {
    try {
      if ("wakeLock" in navigator && !wake.current)
        wake.current = await navigator.wakeLock.request("screen");
      wake.current?.addEventListener("release", () => {
        wake.current = null;
      });
    } catch {
      /* Wake lock is best effort. */
    }
  };
  useEffect(() => {
    const visibility = () => {
      if (document.visibilityState === "visible" && hasStarted.current)
        void requestWake();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      cleanupSensors.current();
      void wake.current?.release();
    };
  }, []);
  const finishPractice = (list: DetectedSwing[]) => {
    detector.current.calibrate(list, neutral.current, handRef.current);
    socket.current?.emit("input:calibration", {
      hand: handRef.current,
      swingSign: detector.current.swingSign,
    });
    setStage("ready");
    stageRef.current = "ready";
    setSensorStatus("");
  };
  const addPractice = (s: DetectedSwing) => {
    samples.current.push(s);
    setCount(samples.current.length);
    navigator.vibrate?.(25);
    if (samples.current.length >= 3) finishPractice(samples.current);
  };
  const useTouch = () => {
    if (
      stageRef.current === "ready" &&
      ["serve", "rally", "point"].includes(phase.phase)
    )
      socket.current?.emit("input:pause");
    cleanupSensors.current();
    setTouch(true);
    setStage("practice");
    stageRef.current = "practice";
    samples.current = [];
    setCount(0);
    hasStarted.current = true;
    setSensorStatus("Touch mode · tap the paddle three times to warm up.");
    void requestWake();
  };
  const enable = async () => {
    setError("");
    if (!window.isSecureContext) {
      setError(
        "Motion needs HTTPS. Open a secure game link, or choose touch controls below.",
      );
      return;
    }
    try {
      const dm = window.DeviceMotionEvent as unknown as
        PermissionEvent | undefined;
      const orientation = window.DeviceOrientationEvent as unknown as
        PermissionEvent | undefined;
      if (!dm)
        throw new Error(
          "This browser has no motion sensors. Choose touch controls.",
        );
      const grants = await Promise.all([
        dm.requestPermission?.() ?? Promise.resolve("granted"),
        orientation?.requestPermission?.() ?? Promise.resolve("granted"),
      ]);
      if (grants.some((p) => p !== "granted"))
        throw new Error(
          "Motion permission was not granted. You can still use touch controls.",
        );
      cleanupSensors.current();
      setTouch(false);
      setStage("practice");
      stageRef.current = "practice";
      samples.current = [];
      setCount(0);
      hasStarted.current = true;
      lastMotion.current = Date.now();
      void requestWake();
      let roll = 0,
        pitch = 0,
        lastPose = 0,
        lastMeter = 0;
      let gotNeutral = false;
      const pose = (e: DeviceOrientationEvent) => {
        roll = e.gamma ?? 0;
        pitch = e.beta ?? 0;
        if (!gotNeutral) {
          neutral.current = roll;
          neutralPitch.current = pitch;
          gotNeutral = true;
        }
        const now = performance.now();
        if (now - lastPose > 33 && socket.current?.connected) {
          setLiveRoll(roll - neutral.current);
          const position = clamp((neutralPitch.current - pitch) / 30, -1, 1);
          lastPose = now;
          socket.current.volatile.emit("input:pose", {
            seq: ++seq.current,
            pitch,
            roll: roll - neutral.current,
            intent: intentRef.current || position,
          });
        }
      };
      const motion = (e: DeviceMotionEvent) => {
        lastMotion.current = Date.now();
        const r = e.rotationRate;
        if (performance.now() - lastMeter > 33) {
          lastMeter = performance.now();
          setStrength(
            clamp(
              Math.max(
                Math.abs(r?.alpha ?? 0),
                Math.abs(r?.beta ?? 0),
                Math.abs(r?.gamma ?? 0),
              ) / detector.current.scale,
              0,
              1,
            ),
          );
        }
        const detected = detector.current.sample({
          t: Date.now(),
          alpha: r?.alpha ?? 0,
          beta: r?.beta ?? 0,
          gamma: r?.gamma ?? 0,
          roll,
        });
        if (!detected) return;
        if (stageRef.current === "practice") addPractice(detected);
        else if (stageRef.current === "ready" && socket.current?.connected) {
          localSwingFeedback();
          socket.current.emit("input:swing", {
            seq: ++seq.current,
            ...detector.current.map(detected),
            lob: lobRef.current,
            drop: dropRef.current,
            spin: detected.sign === detector.current.swingSign ? 0.5 : -0.5,
          });
        }
      };
      window.addEventListener("deviceorientation", pose);
      window.addEventListener("devicemotion", motion);
      cleanupSensors.current = () => {
        window.removeEventListener("deviceorientation", pose);
        window.removeEventListener("devicemotion", motion);
      };
      setSensorStatus(
        "Hold your phone naturally, then take three gentle swings.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not enable motion. Try touch controls.",
      );
    }
  };
  const tap = () => {
    if (!connected) return;
    if (stage === "practice") {
      addPractice({
        peak: 650,
        sign: hand === "right" ? 1 : -1,
        tilt: 0,
        time: Date.now(),
        axis: "beta",
      });
      return;
    }
    if (stage === "ready") {
      localSwingFeedback();
      socket.current?.emit("input:swing", {
        seq: ++seq.current,
        power,
        side: "forehand",
        tilt: aim,
        lob: lobRef.current,
        tPhone: Date.now(),
        drop: dropRef.current,
        intent: intentRef.current,
        spin: 0.5,
      });
    }
  };
  const recalibrate = () => {
    if (["serve", "rally", "point"].includes(phase.phase))
      socket.current?.emit("input:pause");
    samples.current = [];
    setCount(0);
    setStage("practice");
    stageRef.current = "practice";
  };
  const headline =
    phase.phase === "paused"
      ? "A little breather."
      : phase.phase === "matchover"
        ? "Good game!"
        : phase.phase === "point"
          ? "Nice rally."
          : phase.phase === "serve"
            ? phase.serving === "player"
              ? "Your serve."
              : `${RIVALS[phase.rival ?? "pip"].name}’s serve.`
            : "Make it yours.";
  return (
    <div
      className={`phone-app ${flash ? "hit-flash" : ""} ${hand === "left" ? "left-handed" : ""} ${stage === "ready" ? "is-controller" : ""}`}
    >
      <header className="phone-header">
        <a href="/" className="phone-brand">
          dink<span>duel.</span>
        </a>
        <span className="phone-connection">
          <i className={`status-dot ${connected ? "" : "offline"}`} />
          {connected ? `Court ${activeRoom}` : "Connecting…"}
          {ping !== undefined && connected && <small>{ping} ms</small>}
        </span>
      </header>
      <main className="phone-main">
        {!activeRoom || !joined ? (
          <section className="phone-welcome">
            <div className="phone-eyebrow">JOIN A COURT</div>
            <h1>
              Got a court
              <br />
              code?
            </h1>
            <p>
              Find the four-letter code on your game screen. Your next rally is
              one tap away.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (activeRoom === code) {
                  socket.current?.disconnect();
                  socket.current?.connect();
                } else setActiveRoom(code);
              }}
            >
              <label htmlFor="court-code">COURT CODE</label>
              <input
                id="court-code"
                className="code-input"
                autoComplete="off"
                maxLength={4}
                pattern="[A-HJ-KM-NP-Z]{4}"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))
                }
                placeholder="ABCD"
                required
              />
              <button className="phone-primary" type="submit">
                Join the court <span>→</span>
              </button>
            </form>
            {error && (
              <p className="phone-error" role="alert">
                {error}
              </p>
            )}
          </section>
        ) : stage === "welcome" ? (
          <section className="phone-welcome">
            <div className="phone-eyebrow">MEET YOUR NEW PADDLE</div>
            <h1>Your paddle.</h1>
            <p>Tilt to aim. Swing to hit. Hold LOB for height.</p>
            <div className="grip-notice">
              <span>↗</span>
              <p>
                <b>Make a little room.</b>Use a wrist strap or a firm grip.
                Swing gently, away from people and objects.
              </p>
            </div>
            <label className="phone-field-label">PADDLE HAND</label>
            <div className="phone-segment">
              {(["right", "left"] as const).map((h) => (
                <button
                  key={h}
                  aria-pressed={hand === h}
                  className={hand === h ? "selected" : ""}
                  onClick={() => setHand(h)}
                >
                  {h === "right" ? "Right-handed" : "Left-handed"}
                </button>
              ))}
            </div>
            {error && (
              <div className="phone-error" role="alert">
                {error}
              </div>
            )}
            <button className="phone-primary" onClick={enable}>
              Tap to enable motion <span>↗</span>
            </button>
            <button className="phone-text" onClick={useTouch}>
              I’d rather use touch controls →
            </button>
            <p className="phone-footnote">
              Next: three gentle forehand swings.
            </p>
          </section>
        ) : (
          <>
            <div className="phone-score">
              <span>
                YOU <b>{phase.score[0]}</b>
              </span>
              <i>:</i>
              <span>
                <b>{phase.score[1]}</b>{" "}
                {RIVALS[phase.rival ?? "pip"].name.toUpperCase()}
              </span>
            </div>
            <div className="phone-game-heading">
              <div className="phone-eyebrow">
                {stage === "practice"
                  ? "LET’S FIND YOUR FEEL"
                  : phase.phase === "rally"
                    ? `${phase.rally} SHOT RALLY`
                    : "SINGLES"}
              </div>
              <h1>
                {stage === "practice"
                  ? `Practice ${Math.min(count + 1, 3)} of 3.`
                  : headline}
              </h1>
              <p>
                {stage === "practice"
                  ? touch
                    ? "Tap the paddle to practice."
                    : "Hold naturally and make a gentle forehand swing."
                  : phase.message === headline
                    ? "Tilt to aim. Swing to hit."
                    : phase.message}
              </p>
            </div>
            {stage === "practice" && (
              <div
                className="practice-progress"
                aria-label={`${count} of 3 practice swings complete`}
              >
                {[0, 1, 2].map((i) => (
                  <span key={i} className={i < count ? "complete" : ""}>
                    {i < count ? "✓" : i + 1}
                  </span>
                ))}
              </div>
            )}
            <button
              className={`paddle-button ${touch ? "touch-paddle" : ""}`}
              onClick={touch ? tap : undefined}
              onPointerDown={(e) => {
                if (!touch) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                press.current = { at: Date.now(), x: e.clientX };
                setPower(0.24);
              }}
              onPointerMove={(e) => {
                if (!touch || !press.current) return;
                const bounds = e.currentTarget.getBoundingClientRect();
                const value = clamp(
                  ((e.clientX - bounds.left) / bounds.width) * 2 - 1,
                  -1,
                  1,
                );
                setAim(value);
                setLiveRoll(value * 30);
                setPower(
                  clamp(0.3 + (Date.now() - press.current.at) / 800, 0.2, 1),
                );
              }}
              onPointerUp={() => {
                press.current = null;
              }}
              onPointerCancel={() => {
                press.current = null;
              }}
              disabled={
                !connected || (stage === "ready" && phase.phase === "paused")
              }
              aria-label={touch ? "Tap to swing" : "Motion paddle active"}
            >
              <svg
                className="strength-arc"
                viewBox="0 0 220 220"
                aria-label={`Swing strength ${Math.round((touch ? power : strength) * 100)} percent`}
              >
                <circle cx="110" cy="110" r="96" />
                <circle
                  className="strength-fill"
                  cx="110"
                  cy="110"
                  r="96"
                  strokeDasharray="603"
                  strokeDashoffset={603 * (1 - (touch ? power : strength))}
                />
              </svg>
              <span
                className={`paddle-art ${art[`paddle-${skin}`] ? "has-skin" : ""}`}
                style={{
                  transform: `rotate(${clamp(liveRoll, -35, 35) - 8}deg)`,
                  filter: flash ? "brightness(1.2)" : "none",
                }}
              >
                {art[`paddle-${skin}`] && (
                  <img
                    className="generated-paddle"
                    src={art[`paddle-${skin}`].file}
                    alt=""
                    draggable="false"
                  />
                )}
                <span className="paddle-perforations">
                  ···
                  <br />
                  ···
                  <br />
                  ···
                </span>
                <span className="paddle-dd">dd.</span>
              </span>
              <span className="paddle-caption">
                {touch
                  ? "TAP TO SWING"
                  : stage === "practice"
                    ? "TAKE A GENTLE SWING"
                    : "SWING TO HIT"}
              </span>
            </button>
            <div
              className="tilt-indicator"
              aria-label={`Aim ${aim < -0.2 ? "left" : aim > 0.2 ? "right" : "center"}`}
            >
              <span>LEFT</span>
              <div>
                <i
                  style={{ left: `${50 + clamp(liveRoll / 35, -1, 1) * 45}%` }}
                />
              </div>
              <span>RIGHT</span>
            </div>
            {touch && (
              <p className="touch-instruction">
                Slide to aim. Hold and move for power. Tap to hit.
              </p>
            )}
            {settingsOpen && (
              <div
                className="phone-settings"
                role="region"
                aria-label="Controller settings"
              >
                <div className="phone-settings-heading">
                  <h2>Settings</h2>
                  <button onClick={() => setSettingsOpen(false)}>Done</button>
                </div>
                <div
                  className="skin-picker"
                  role="group"
                  aria-label="Paddle skin"
                >
                  {[1, 2, 3, 4, 5, 6].map((id) => (
                    <button
                      key={id}
                      aria-label={`Paddle skin ${id}`}
                      aria-pressed={skin === id}
                      onClick={() => {
                        setSkin(id);
                        try {
                          localStorage.setItem("dink-skin", String(id));
                        } catch {
                          /* Optional. */
                        }
                      }}
                    >
                      {art[`paddle-${id}`] ? (
                        <img
                          src={art[`paddle-${id}`].file}
                          width="30"
                          height="48"
                          alt=""
                        />
                      ) : (
                        id
                      )}
                    </button>
                  ))}
                </div>
                {touch && (
                  <div className="touch-controls">
                    <label htmlFor="aim">
                      AIM{" "}
                      <span>
                        {aim < -0.2 ? "Left" : aim > 0.2 ? "Right" : "Center"}
                      </span>
                    </label>
                    <input
                      id="aim"
                      type="range"
                      min="-1"
                      max="1"
                      step="0.05"
                      value={aim}
                      onChange={(e) => setAim(Number(e.target.value))}
                    />
                    <label htmlFor="power">
                      POWER <span>{Math.round(power * 100)}%</span>
                    </label>
                    <input
                      id="power"
                      type="range"
                      min="0.15"
                      max="1"
                      step="0.05"
                      value={power}
                      onChange={(e) => setPower(Number(e.target.value))}
                    />
                  </div>
                )}
                {!touch && stage === "ready" && (
                  <div className="sensitivity-control">
                    <label htmlFor="sensitivity">
                      SWING SENSITIVITY <span>{sensitivity.toFixed(1)}×</span>
                    </label>
                    <input
                      id="sensitivity"
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      value={sensitivity}
                      onChange={(e) => {
                        setSensitivity(Number(e.target.value));
                        detector.current.sensitivity = Number(e.target.value);
                      }}
                    />
                  </div>
                )}
              </div>
            )}
            {stage === "ready" && (
              <div className="phone-actions">
                <button
                  className={`lob-button ${lob ? "held" : ""}`}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    lobRef.current = true;
                    setLob(true);
                  }}
                  onPointerUp={() => {
                    lobRef.current = false;
                    setLob(false);
                  }}
                  onPointerCancel={() => {
                    lobRef.current = false;
                    setLob(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      lobRef.current = true;
                      setLob(true);
                    }
                  }}
                  onKeyUp={() => {
                    lobRef.current = false;
                    setLob(false);
                  }}
                >
                  ↑ <b>LOB</b>
                  <span>HOLD FOR HEIGHT</span>
                </button>
                <button
                  className={`drop-button ${drop ? "held" : ""}`}
                  aria-pressed={drop}
                  onClick={() => {
                    dropRef.current = !drop;
                    setDrop(!drop);
                  }}
                >
                  DROP<span>{drop ? "ON" : "OFF"}</span>
                </button>
                <button
                  className="phone-pause"
                  aria-label={
                    phase.phase === "paused" ? "Resume match" : "Pause match"
                  }
                  onClick={() => socket.current?.emit("input:pause")}
                >
                  {phase.phase === "paused" ? "▶" : "Ⅱ"}
                  <span>{phase.phase === "paused" ? "RESUME" : "PAUSE"}</span>
                </button>
              </div>
            )}
            {stage === "ready" && (
              <div className="position-controls" aria-label="Court position">
                <button
                  aria-pressed={intent > 0}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    sendIntent(1);
                  }}
                  onPointerUp={() => sendIntent(0)}
                  onPointerCancel={() => sendIntent(0)}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") sendIntent(1);
                  }}
                  onKeyUp={() => sendIntent(0)}
                >
                  ↑ ADVANCE <small>HOLD</small>
                </button>
                <button
                  aria-pressed={intent < 0}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    sendIntent(-1);
                  }}
                  onPointerUp={() => sendIntent(0)}
                  onPointerCancel={() => sendIntent(0)}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") sendIntent(-1);
                  }}
                  onKeyUp={() => sendIntent(0)}
                >
                  ↓ RETREAT <small>HOLD</small>
                </button>
              </div>
            )}
            {sensorStatus && (
              <p className="phone-sensor-note" role="status">
                {sensorStatus}
              </p>
            )}
            {error && (
              <div className="phone-error" role="alert">
                {error}
              </div>
            )}
            <div className="phone-tools">
              <button onClick={() => setSettingsOpen(!settingsOpen)}>
                Settings
              </button>
              {!touch && <button onClick={useTouch}>Use touch controls</button>}
              {stage === "ready" && (
                <button onClick={recalibrate}>Recalibrate</button>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Phone />);
