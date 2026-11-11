import { useEffect, useRef, useState, type RefObject } from "react";
import type { MotionVisual } from "./use-controller";
import { RelativeAim, SwingPress, TAP_POWER } from "./thumb-input";
import { clamp } from "../game/solver";
import type { ReadinessMessage } from "@dink/shared";
import { COPY } from "../game/readiness/config";

type Props = {
  readiness?: ReadinessMessage;
  motion: boolean;
  leftHanded: boolean;
  disabled: boolean;
  lobChip: boolean;
  visual: RefObject<MotionVisual>;
  paddle: string | undefined;
  onAim: (value: number) => void;
  onSwing: (shot: { power: number; lob: boolean; tilt?: number }) => void;
};
export function ThumbControls(props: Props) {
  const readiness = props.readiness?.enabled ? props.readiness : undefined;
  const label = readiness
    ? readiness.serving
      ? COPY.serve
      : COPY.phone[readiness.state]
    : "Swing";
  const latest = useRef(props);
  latest.current = props;
  const aim = useRef(new RelativeAim()),
    press = useRef(new SwingPress());
  const aimZone = useRef<HTMLDivElement>(null),
    dot = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null),
    ring = useRef<SVGCircleElement>(null);
  const paddle = useRef<HTMLSpanElement>(null);
  const [lob, setLob] = useState(false);
  const lobRef = useRef(lob);
  lobRef.current = lob;
  const cancel = (id?: number) => {
    press.current.cancel(performance.now(), id);
    if (button.current)
      button.current.dataset.pressed = String(press.current.active);
  };
  useEffect(() => {
    let frame = 0,
      last = 0,
      lastSend = 0,
      sentAim = 0,
      roll = 0,
      pitch = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const animate = (now: number) => {
      const dt = Math.min(64, now - (last || now));
      last = now;
      const p = latest.current;
      const value = aim.current.step(dt, reduced.matches);
      if (dot.current)
        dot.current.style.transform = `translateX(${value * Math.min(90, (aimZone.current?.clientWidth ?? 300) * 0.3)}px)`;
      aimZone.current?.setAttribute(
        "aria-valuenow",
        String(Math.round(value * 100)),
      );
      if (
        !p.disabled &&
        !p.motion &&
        now - lastSend >= 33 &&
        Math.abs(value - sentAim) > 0.001
      ) {
        p.onAim(value);
        sentAim = value;
        lastSend = now;
      }
      if (press.current.active) {
        if (ring.current)
          ring.current.style.strokeDashoffset = String(
            603 * (1 - press.current.power(now)),
          );
        if (button.current)
          button.current.dataset.lob = String(
            press.current.lob || lobRef.current,
          );
      } else if (ring.current)
        ring.current.style.strokeDashoffset = String(
          603 * (1 - (p.motion ? p.visual.current.power : 0)),
        );
      const blend = reduced.matches ? 1 : 1 - Math.exp(-dt / 65);
      roll += (p.visual.current.roll - roll) * blend;
      pitch += (p.visual.current.pitch - pitch) * blend;
      if (paddle.current)
        paddle.current.style.transform = `perspective(400px) rotateX(${clamp(pitch, -20, 20)}deg) rotate(${clamp(roll, -30, 30) - 12}deg)`;
      frame = requestAnimationFrame(animate);
    };
    const suspend = () => {
      cancel();
      aim.current.reset();
      if (dot.current) dot.current.style.transform = "";
    };
    const rotate = () => {
      suspend();
      latest.current.onAim(0);
    };
    window.addEventListener("blur", suspend);
    document.addEventListener("visibilitychange", suspend);
    window.addEventListener("orientationchange", rotate);
    if (!latest.current.motion) latest.current.onAim(0);
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("blur", suspend);
      document.removeEventListener("visibilitychange", suspend);
      window.removeEventListener("orientationchange", rotate);
    };
  }, []);
  useEffect(() => {
    if (props.disabled) {
      cancel();
      aim.current.reset();
    }
  }, [props.disabled]);
  const fire = (power: number, isLob: boolean) => {
    const p = latest.current;
    if (p.disabled) return;
    p.onSwing({
      power,
      lob: isLob || lobRef.current,
      tilt: p.motion ? undefined : aim.current.value,
    });
    setLob(false);
  };
  const capture = (element: HTMLElement, id: number) => {
    try {
      element.setPointerCapture(id);
    } catch {
      /* Synthetic pointers may not be capturable. */
    }
  };
  return (
    <div
      className={`thumb-controls ${props.leftHanded ? "left-handed" : ""} ${props.motion ? "motion-controls" : ""}`}
    >
      {!props.motion && (
        <div
          className="relative-aim"
          ref={aimZone}
          role="slider"
          aria-label="Aim"
          aria-valuemin={-100}
          aria-valuemax={100}
          aria-valuenow={0}
          aria-disabled={props.disabled}
          tabIndex={props.disabled ? -1 : 0}
          onPointerDown={(e) => {
            if (
              latest.current.disabled ||
              !aim.current.begin(e.pointerId, e.clientX)
            )
              return;
            capture(e.currentTarget, e.pointerId);
            e.currentTarget.dataset.active = "true";
          }}
          onPointerMove={(e) => {
            aim.current.move(
              e.pointerId,
              e.clientX,
              e.currentTarget.clientWidth,
            );
            if (aim.current.active)
              latest.current.visual.current.roll = aim.current.value * 35;
          }}
          onPointerUp={(e) => {
            aim.current.release(e.pointerId);
            e.currentTarget.dataset.active = String(aim.current.active);
          }}
          onPointerCancel={(e) => {
            aim.current.release(e.pointerId);
            e.currentTarget.dataset.active = String(aim.current.active);
          }}
          onLostPointerCapture={(e) => {
            aim.current.release(e.pointerId);
            e.currentTarget.dataset.active = String(aim.current.active);
          }}
          onKeyDown={(e) => {
            if (
              !latest.current.disabled &&
              (e.key === "ArrowLeft" || e.key === "ArrowRight")
            ) {
              e.preventDefault();
              aim.current.value = clamp(
                aim.current.value + (e.key === "ArrowLeft" ? -0.15 : 0.15),
                -1,
                1,
              );
              latest.current.onAim(aim.current.value);
            }
          }}
        >
          <span className="aim-name">Aim</span>
          <div className="aim-track" aria-hidden="true">
            <span>←</span>
            <i />
            <span>→</span>
            <span className="thumb-dot" ref={dot} />
          </div>
        </div>
      )}
      <div className="swing-zone">
        <button
          ref={button}
          className="swing-button paddle-button"
          data-readiness={readiness?.state}
          aria-label="Swing"
          aria-describedby="swing-readiness-label"
          disabled={props.disabled}
          onPointerDown={(e) => {
            if (
              latest.current.disabled ||
              !press.current.begin(
                e.pointerId,
                performance.now(),
                e.clientX,
                e.clientY,
              )
            )
              return;
            capture(e.currentTarget, e.pointerId);
            e.currentTarget.dataset.pressed = "true";
            if (ring.current)
              ring.current.style.strokeDashoffset = String(
                603 * (1 - TAP_POWER),
              );
          }}
          onPointerMove={(e) =>
            press.current.move(e.pointerId, e.clientX, e.clientY)
          }
          onPointerUp={(e) => {
            press.current.move(e.pointerId, e.clientX, e.clientY);
            const shot = press.current.release(e.pointerId, performance.now());
            e.currentTarget.dataset.pressed = String(press.current.active);
            if (shot) {
              e.preventDefault();
              fire(shot.power, shot.lob);
            }
          }}
          onPointerCancel={(e) => cancel(e.pointerId)}
          onLostPointerCapture={(e) => {
            if (press.current.active) cancel(e.pointerId);
          }}
          onBlur={() => cancel()}
          onClick={() => {
            if (press.current.acceptsClick(performance.now()))
              fire(TAP_POWER, false);
          }}
          onKeyDown={(e) => {
            if ((e.key === " " || e.key === "Enter") && !e.repeat) {
              e.preventDefault();
              press.current.begin(-1, performance.now(), 0, 0);
              if (button.current) button.current.dataset.pressed = "true";
            }
          }}
          onKeyUp={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              const shot = press.current.release(-1, performance.now());
              e.currentTarget.dataset.pressed = "false";
              if (shot) fire(shot.power, shot.lob);
            }
          }}
        >
          <svg className="swing-ring" viewBox="0 0 220 220" aria-hidden="true">
            <circle cx="110" cy="110" r="96" />
            <circle
              ref={ring}
              className="swing-fill"
              cx="110"
              cy="110"
              r="96"
              strokeDasharray="603"
              strokeDashoffset="603"
            />
          </svg>
          <span ref={paddle} className="paddle-art" aria-hidden="true">
            {props.paddle ? (
              <img src={props.paddle} alt="" draggable="false" />
            ) : (
              "dd."
            )}
          </span>
          <span id="swing-readiness-label" className="swing-label">
            {readiness?.state.startsWith("WAIT_") && (
              <svg
                className="bounce-lock"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5z" />
              </svg>
            )}
            {label}
          </span>
        </button>
        {props.lobChip && !props.motion && (
          <button
            className="lob-chip"
            aria-pressed={lob}
            onClick={() => setLob(!lob)}
          >
            Lob
          </button>
        )}
      </div>
    </div>
  );
}
