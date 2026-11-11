import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientEvents,
  ServerEvents,
  GamePhase,
  JoinResult,
  Swing,
  ReadinessMessage,
} from "@dink/shared";
import { SwingDetector, type DetectedSwing } from "./swing";
import { clamp } from "../game/solver";
import { ReadinessReceiver } from "../game/readiness/controller-sync";
import { READINESS } from "../game/readiness/config";

type Stage = "welcome" | "practice" | "ready";
type Preferences = {
  hand: "left" | "right";
  sensitivity: number;
  haptics: boolean;
  lobChip: boolean;
  skin: number;
};
type PermissionEvent = {
  requestPermission?: () => Promise<"granted" | "denied">;
};
export type MotionVisual = { roll: number; pitch: number; power: number };
function readPreferences(): Preferences {
  const defaults: Preferences = {
    hand: "right",
    sensitivity: /Android/i.test(navigator.userAgent) ? 0.8 : 1,
    haptics: true,
    lobChip: false,
    skin: 1,
  };
  try {
    const saved = JSON.parse(localStorage.getItem("dink-controller") ?? "{}");
    return {
      hand: saved.hand === "left" ? "left" : "right",
      sensitivity:
        typeof saved.sensitivity === "number"
          ? clamp(saved.sensitivity, 0.5, 2)
          : defaults.sensitivity,
      haptics: saved.haptics !== false,
      lobChip: saved.lobChip === true,
      skin: clamp(Number(localStorage.getItem("dink-skin")) || 1, 1, 6),
    };
  } catch {
    return defaults;
  }
}
export function useController() {
  const [readiness, setReadiness] = useState<ReadinessMessage>();
  const readinessReceiver = useRef(new ReadinessReceiver());
  const initial =
    new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";
  const [code, setCode] = useState(initial),
    [room, setRoom] = useState(initial);
  const [connected, setConnected] = useState(false),
    [joined, setJoined] = useState(false);
  const [error, setError] = useState(""),
    [stage, setStage] = useState<Stage>("welcome");
  const [motion, setMotion] = useState(false),
    [count, setCount] = useState(0);
  const [settings, setSettings] = useState(false),
    [localPaused, setLocalPaused] = useState(false);
  const [preferences, setPreferences] = useState(readPreferences);
  const [ping, setPing] = useState<number>(),
    [sensorStatus, setSensorStatus] = useState("");
  const [feedback, setFeedback] = useState<
    "" | "hit" | "perfect" | "fault" | "point"
  >("");
  const [phase, setPhase] = useState<GamePhase>({
    phase: "waiting",
    score: [0, 0],
    rally: 0,
    serving: "player",
    message: "",
  });
  const socket = useRef<Socket<ServerEvents, ClientEvents> | null>(null);
  const session = useRef<{ roomCode: string; playerId: string } | null>(null);
  const detector = useRef(new SwingDetector()),
    samples = useRef<DetectedSwing[]>([]);
  const seq = useRef(Date.now()),
    visual = useRef<MotionVisual>({ roll: 0, pitch: 0, power: 0 });
  const cleanupSensors = useRef<() => void>(() => {});
  const wake = useRef<WakeLockSentinel | null>(null),
    wakePending = useRef(false),
    started = useRef(false);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const lastMotion = useRef(0),
    neutral = useRef({ roll: 0, pitch: 0 });
  const neutralNeeded = useRef(true);
  const state = useRef({
    stage,
    phase,
    preferences,
    motion,
    settings,
    connected,
    localPaused,
  });
  state.current = {
    stage,
    phase,
    preferences,
    motion,
    settings,
    connected,
    localPaused,
  };
  const paused = localPaused || phase.phase === "paused";
  const inputAllowed = () => {
    const s = state.current;
    return (
      !document.hidden &&
      !s.settings &&
      !s.localPaused &&
      (s.stage === "practice" ||
        (s.stage === "ready" &&
          s.connected &&
          s.phase.phase !== "paused" &&
          s.phase.phase !== "matchover"))
    );
  };
  const vibrate = (pattern: number | number[]) => {
    if (state.current.preferences.haptics) {
      try {
        navigator.vibrate?.(pattern);
      } catch {
        /* Unsupported hardware is a no-op. */
      }
    }
  };
  const showFeedback = (kind: typeof feedback) => {
    clearTimeout(feedbackTimer.current);
    setFeedback(kind);
    feedbackTimer.current = setTimeout(
      () => setFeedback(""),
      kind === "perfect" ? 650 : 400,
    );
  };
  const requestWake = async () => {
    if (
      wakePending.current ||
      wake.current ||
      document.hidden ||
      !("wakeLock" in navigator)
    )
      return;
    wakePending.current = true;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      wake.current = sentinel;
      sentinel.addEventListener(
        "release",
        () => {
          if (wake.current === sentinel) wake.current = null;
        },
        { once: true },
      );
    } catch {
      /* Low power mode and unsupported browsers can refuse the lock. */
    } finally {
      wakePending.current = false;
    }
  };
  const resetDetector = () => {
    detector.current = new SwingDetector();
    detector.current.sensitivity = state.current.preferences.sensitivity;
    if (state.current.stage === "ready")
      detector.current.calibrate(
        samples.current,
        neutral.current.roll,
        state.current.preferences.hand,
      );
  };
  const pause = () => {
    if (!state.current.connected || state.current.stage !== "ready") return;
    if (state.current.phase.phase === "paused") {
      socket.current?.emit("input:pause");
      return;
    }
    if (state.current.localPaused) return;
    state.current.localPaused = true;
    setLocalPaused(true);
    resetDetector();
    socket.current?.emit("input:pause");
  };
  const updatePreferences = (patch: Partial<Preferences>) => {
    const next = { ...state.current.preferences, ...patch };
    state.current.preferences = next;
    setPreferences(next);
    detector.current.sensitivity = next.sensitivity;
    detector.current.hand = next.hand;
    try {
      localStorage.setItem("dink-controller", JSON.stringify(next));
      localStorage.setItem("dink-skin", String(next.skin));
    } catch {
      /* Preferences remain usable without storage. */
    }
    if (patch.hand && state.current.stage === "ready") {
      // Changing hands does not send calibration: that message resumes a paused host.
      resetDetector();
    }
  };
  useEffect(() => {
    if (!room) return;
    readinessReceiver.current.reset();
    setReadiness(undefined);
    const s = io(location.origin, { transports: ["websocket"] });
    socket.current = s;
    session.current = null;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(`dink-session-${room}`) ?? "null",
      );
      if (saved?.roomCode === room && saved?.playerId) session.current = saved;
    } catch {
      /* Session storage is optional. */
    }
    const result = (r: JoinResult) => {
      if (!r.ok) {
        setError(r.error);
        setJoined(false);
        session.current = null;
        try {
          sessionStorage.removeItem(`dink-session-${room}`);
        } catch {
          /* Optional. */
        }
        return;
      }
      session.current = { roomCode: room, playerId: r.playerId };
      try {
        sessionStorage.setItem(
          `dink-session-${room}`,
          JSON.stringify(session.current),
        );
      } catch {
        /* Optional. */
      }
      setConnected(true);
      setJoined(true);
      setError("");
      setSensorStatus("");
      if (state.current.stage === "ready" && !document.hidden)
        s.emit("input:calibration", {
          hand: state.current.preferences.hand,
          swingSign: detector.current.swingSign,
        });
    };
    s.on("connect", () => {
      if (session.current) s.emit("controller:resume", session.current, result);
      else s.emit("controller:join", { roomCode: room }, result);
    });
    s.on("disconnect", () => {
      state.current.connected = false;
      setConnected(false);
      setPing(undefined);
      resetDetector();
      setSensorStatus("Reconnecting to your court…");
    });
    s.on("connect_error", () => {
      setConnected(false);
      setError("Can’t reach the court. Check your connection.");
    });
    s.on("game:phase", (p) => {
      state.current.phase = p;
      state.current.localPaused = p.phase === "paused";
      setPhase(p);
      setLocalPaused(p.phase === "paused");
      if (p.phase === "paused") resetDetector();
      if (p.phase === "calibrate" && state.current.stage === "ready")
        s.emit("input:calibration", {
          hand: state.current.preferences.hand,
          swingSign: detector.current.swingSign,
        });
    });
    s.on("game:readiness", (message: ReadinessMessage) => {
      const previous = readinessReceiver.current.current;
      if (!readinessReceiver.current.accept(message)) return;
      setReadiness(message);
      if (
        !message.enabled ||
        !inputAllowed() ||
        state.current.stage !== "ready"
      )
        return;
      if (previous?.state !== message.state) {
        if (message.state === "IN_REACH" && !message.serving)
          vibrate(READINESS.haptics.enterReachMs);
        else if (message.state === "GET_READY")
          vibrate(READINESS.haptics.getReadyMs);
      }
    });
    s.on("haptic", ({ pattern }) => {
      vibrate(pattern);
      showFeedback(
        pattern[0] === 12
          ? "perfect"
          : pattern[0] === 65
            ? "fault"
            : pattern[0] === 20
              ? "point"
              : "hit",
      );
    });
    s.on("room:closed", ({ reason }) => {
      setError(reason);
      setConnected(false);
      setJoined(false);
      state.current.connected = false;
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
          if (err || !reply) {
            setPing(1500);
            return;
          }
          const rtt = Date.now() - start;
          setPing(Math.round(rtt));
          s.emit("net:latency", {
            rtt,
            offset: reply.tHost - (start + rtt / 2),
          });
        },
      );
      if (
        state.current.motion &&
        started.current &&
        Date.now() - lastMotion.current > 3500 &&
        !document.hidden
      )
        setSensorStatus("No motion readings. Switch to touch in Settings.");
    }, 2000);
    return () => {
      clearInterval(interval);
      s.disconnect();
    };
  }, [room]);
  useEffect(() => {
    const suspend = () => {
      if (["serve", "rally", "point"].includes(state.current.phase.phase))
        pause();
      resetDetector();
    };
    const visibility = () => {
      if (document.hidden) suspend();
      else if (started.current) void requestWake();
    };
    const offline = () => {
      suspend();
      socket.current?.disconnect();
    };
    const online = () => socket.current?.connect();
    const rotate = () => {
      neutralNeeded.current = true;
      resetDetector();
    };
    const prevent = (e: Event) => e.preventDefault();
    const preventPinch = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", suspend);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    window.addEventListener("orientationchange", rotate);
    document.addEventListener("gesturestart", prevent, { passive: false });
    document.addEventListener("gesturechange", prevent, { passive: false });
    document.addEventListener("touchmove", preventPinch, { passive: false });
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", suspend);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      window.removeEventListener("orientationchange", rotate);
      document.removeEventListener("gesturestart", prevent);
      document.removeEventListener("gesturechange", prevent);
      document.removeEventListener("touchmove", preventPinch);
      cleanupSensors.current();
      clearTimeout(feedbackTimer.current);
      started.current = false;
      void wake.current?.release();
    };
  }, []);
  const beginPractice = (useMotion: boolean) => {
    samples.current = [];
    state.current.stage = "practice";
    state.current.motion = useMotion;
    state.current.localPaused = false;
    setStage("practice");
    setMotion(useMotion);
    setCount(0);
    setLocalPaused(false);
    setSensorStatus("");
    setError("");
    neutralNeeded.current = true;
    detector.current = new SwingDetector();
    detector.current.sensitivity = state.current.preferences.sensitivity;
    started.current = true;
    lastMotion.current = Date.now();
    void requestWake();
  };
  const practice = (swing: DetectedSwing) => {
    if (samples.current.length >= 3) return;
    samples.current.push(swing);
    setCount(samples.current.length);
    vibrate(25);
    if (samples.current.length === 3) {
      detector.current.calibrate(
        samples.current,
        neutral.current.roll,
        state.current.preferences.hand,
      );
      state.current.stage = "ready";
      setStage("ready");
      setSensorStatus("");
      socket.current?.emit("input:calibration", {
        hand: state.current.preferences.hand,
        swingSign: detector.current.swingSign,
      });
    }
  };
  const sendSwing = (
    shot: Pick<Swing, "power" | "lob"> &
      Partial<Pick<Swing, "side" | "tilt" | "tPhone">>,
  ) => {
    if (!inputAllowed()) return;
    if (state.current.stage === "practice") {
      practice({
        peak: 650,
        sign: state.current.preferences.hand === "right" ? 1 : -1,
        tilt: 0,
        time: Date.now(),
        axis: "beta",
      });
      return;
    }
    vibrate(8);
    socket.current?.emit("input:swing", {
      seq: ++seq.current,
      power: shot.power,
      side: shot.side ?? "forehand",
      tilt: shot.tilt ?? clamp(visual.current.roll / 35, -1, 1),
      lob: shot.lob,
      tPhone: shot.tPhone ?? Date.now(),
      spin: shot.side === "backhand" ? -0.5 : 0.5,
      assisted: true,
    });
  };
  const enableMotion = async () => {
    setError("");
    if (!window.isSecureContext) {
      setError(
        "Motion needs HTTPS. Use the secure court link, or choose touch controls.",
      );
      return;
    }
    try {
      const dm = window.DeviceMotionEvent as unknown as
        PermissionEvent | undefined;
      const orientation = window.DeviceOrientationEvent as unknown as
        PermissionEvent | undefined;
      if (!dm)
        throw new Error("Motion sensors unavailable. Choose touch controls.");
      const grants = await Promise.all([
        dm.requestPermission?.() ?? "granted",
        orientation?.requestPermission?.() ?? "granted",
      ]);
      if (grants.some((p) => p !== "granted"))
        throw new Error(
          "Motion permission was not granted. You can still use touch controls.",
        );
      cleanupSensors.current();
      beginPractice(true);
      let roll = 0,
        lastPose = 0;
      const pose = (e: DeviceOrientationEvent) => {
        if (!inputAllowed()) return;
        const angle =
          screen.orientation?.angle ??
          (window as Window & { orientation?: number }).orientation ??
          0;
        const landscape = matchMedia("(orientation: landscape)").matches;
        const sign = angle < 0 || angle === 270 ? -1 : 1;
        roll = landscape ? (e.beta ?? 0) * sign : (e.gamma ?? 0);
        const pitch = landscape ? (e.gamma ?? 0) * sign : (e.beta ?? 0);
        if (neutralNeeded.current) {
          neutral.current = { roll, pitch };
          detector.current.neutral = roll;
          neutralNeeded.current = false;
        }
        visual.current.roll = roll - neutral.current.roll;
        visual.current.pitch = pitch - neutral.current.pitch;
        if (performance.now() - lastPose > 33) {
          lastPose = performance.now();
          socket.current?.volatile.emit("input:pose", {
            seq: ++seq.current,
            pitch: clamp(pitch, -180, 180),
            roll: clamp(visual.current.roll, -180, 180),
          });
        }
      };
      const motionEvent = (e: DeviceMotionEvent) => {
        if (!inputAllowed()) return;
        lastMotion.current = Date.now();
        const r = e.rotationRate;
        visual.current.power = clamp(
          Math.max(
            Math.abs(r?.alpha ?? 0),
            Math.abs(r?.beta ?? 0),
            Math.abs(r?.gamma ?? 0),
          ) / detector.current.scale,
          0,
          1,
        );
        const hit = detector.current.sample({
          t: Date.now(),
          alpha: r?.alpha ?? 0,
          beta: r?.beta ?? 0,
          gamma: r?.gamma ?? 0,
          roll,
        });
        if (!hit) return;
        if (state.current.stage === "practice") practice(hit);
        else sendSwing({ ...detector.current.map(hit), lob: false });
      };
      window.addEventListener("deviceorientation", pose);
      window.addEventListener("devicemotion", motionEvent);
      cleanupSensors.current = () => {
        window.removeEventListener("deviceorientation", pose);
        window.removeEventListener("devicemotion", motionEvent);
      };
      setSettings(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not enable motion. Try touch controls.",
      );
    }
  };
  const useTouch = () => {
    cleanupSensors.current();
    beginPractice(false);
    setSettings(false);
  };
  const recalibrate = () => {
    if (["serve", "rally", "point"].includes(state.current.phase.phase))
      pause();
    beginPractice(state.current.motion);
    setSettings(false);
  };
  const openSettings = () => {
    if (["serve", "rally", "point"].includes(state.current.phase.phase))
      pause();
    state.current.settings = true;
    setSettings(true);
  };
  const sendAim = (value: number) => {
    if (!inputAllowed() || state.current.motion) return;
    visual.current.roll = value * 35;
    if (state.current.stage === "ready")
      socket.current?.volatile.emit("input:pose", {
        seq: ++seq.current,
        pitch: 0,
        roll: value * 35,
      });
  };
  const join = () => {
    if (room === code) {
      socket.current?.disconnect();
      socket.current?.connect();
    } else {
      setJoined(false);
      setConnected(false);
      setRoom(code);
    }
  };
  return {
    readiness,
    code,
    setCode,
    room,
    connected,
    joined,
    error,
    stage,
    count,
    motion,
    preferences,
    updatePreferences,
    ping,
    sensorStatus,
    feedback,
    phase,
    paused,
    settings,
    setSettings,
    openSettings,
    pause,
    enableMotion,
    useTouch,
    recalibrate,
    sendSwing,
    sendAim,
    visual,
    inputAllowed,
    join,
  };
}
