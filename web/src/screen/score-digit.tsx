import { useEffect, useLayoutEffect, useRef } from "react";

export function ScoreDigit({ value }: { value: number }) {
  const element = useRef<HTMLElement>(null);
  const previous = useRef(value);
  const active = useRef<Animation | null>(null);
  useEffect(() => () => active.current?.cancel(), []);
  useLayoutEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    const node = element.current;
    if (
      !node ||
      document.documentElement.dataset.reducedMotion === "true" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const current = getComputedStyle(node).transform;
    node.getAnimations().forEach((animation) => animation.cancel());
    active.current = node.animate(
      [
        { transform: current },
        { transform: "scale(1.06)", offset: 0.35 },
        { transform: "scale(1)" },
      ],
      { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
  }, [value]);
  return (
    <b className="score-digit" ref={element}>
      {value}
    </b>
  );
}
