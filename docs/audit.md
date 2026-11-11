# Experience audit

Baseline: playable single-instance TypeScript game, captured before phase 1. The original 22 Vitest tests are retained.

## Keep
- Shared, validated event protocol; reliable swings and volatile poses; resumable controller identity.
- Pure scoring rules, 120 Hz Rapier ball, seeded solver/AI, auto footwork, keyboard fallback.
- QR pairing, calibration, saved rally best, sunset unlock, Docker and CI.

## Cut
- Marketing header, footer, benefit strip and setup card during play. They shrink the court and bury the ball.
- Full-size serve/point copy in the center of the flight path. Use an edge toast.
- Repeated slogans and tiny low-contrast labels. Use one title line and actionable copy.

## Fix
- Add explicit timing, positioning intent, drop and spin. Existing power mostly changes shot class.
- AI currently changes speed and error only; give it a shot policy and visible identity.
- Add match-local statistics. The current best-rally field is a lifetime record, not match longest.
- Distinguish local swing acknowledgement from confirmed contact haptics.
- Add quality, audio levels, settings, opt-in local metrics and a guided practice flow.
- Baseline lint fails in the recently added screenshot helper (browser globals); fix its scoped environment.
- Physical detection, local-network latency and frame-rate targets are unmeasured.

Decision: a living diorama title leads into an unobstructed sports broadcast view; decoration never sits over active play.
