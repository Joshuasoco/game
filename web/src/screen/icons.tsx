import type React from "react";
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
