# Phone controller verification

The default play surface has two primary targets: relative Aim and Swing. Optional Lob is hidden until enabled in Settings. Toolbar Pause and Settings are 64 × 64 px. Portrait uses the same input logic; motion mode hides Aim.

## Automated checks

Run the regular project checks:

```powershell
npm run check
npx playwright test
```

Run controller checks against both browser engines:

```powershell
npx playwright test --config playwright.controller.config.ts
```

The controller suite creates a private real relay per test. A test-only browser WebSocket subclass redirects the socket URL to that relay, preserving network/offline behavior without disabling production rate limits. Sensor, haptic and wake-lock tests use explicit mocks. The existing integration tests also pair a real host page with the phone.

Unit coverage includes 700 ms charge mapping, upward-swipe lob detection, duplicate-click suppression, pointer cancellation, relative aim/spring behavior, soft-shot selection, recovery depth, and legacy/extended schema acceptance. Real physics match tests run every difficulty with and without assistance.

## Screenshots

Captured before the two-thumb change:

- [Landscape 844 × 390](../artifacts/controller-two-thumb/before-844x390.png)
- [Portrait 390 × 844](../artifacts/controller-two-thumb/before-390x844.png)

The controller suite writes after images at both sizes under `artifacts/controller-two-thumb/`, with the browser project name in the filename. It also checks a compact 667 × 320 viewport and mirrors both requested sizes in left-handed mode.

## iPhone Safari checklist — real device unverified

Use the HTTPS court URL and run this checklist in a Safari tab and again after Share → Add to Home Screen. The manifest permits both orientations.

- [ ] Join using the court code; score, connection dot and ping match the host.
- [ ] Grant native motion permission, calibrate with three gentle swings, and verify tilt direction in both landscape directions and portrait.
- [ ] Deny permission and complete touch calibration; use Settings to retry motion or recalibrate.
- [ ] Drag Aim from different starting points without a jump. Aim and charge simultaneously with two thumbs; release Aim and verify the spring to center.
- [ ] Tap Swing for a medium shot, charge to full in about 700 ms, swipe upward for a lob, and cancel a gesture without a shot.
- [ ] Verify low/soft contacts choose dink near the net and drop from deep; charging sends a drive. Observe automatic approach/recovery while respecting kitchen rules.
- [ ] Pause mid-charge: controls disappear and no shot leaks through. Resume restores the controls. Back to clubhouse navigates correctly.
- [ ] Open Settings mid-rally, change sensitivity/handedness/haptics, and close it. Resume deliberately. Confirm mirrored zones and optional one-shot Lob chip.
- [ ] Toggle Wi-Fi briefly. Confirm reconnect state, disabled input, saved score/session, and working input afterward. Induce latency and verify the warning.
- [ ] Check hit/perfect/fault/point feedback and perfect-ring flash. Vibration availability and actual patterns are unverified; unsupported devices should remain quiet and functional.
- [ ] Play past the normal screen-sleep interval, background/foreground the app, and verify wake-lock reacquisition where the system allows it.
- [ ] Verify the notch and home indicator in both landscape directions, portrait, Safari with browser chrome expanded/collapsed, and the installed app.
- [ ] Try pinch, double-tap, and overscroll gestures; the play controls should not zoom, select text, refresh, or navigate.
- [ ] Enable Reduce Motion and check the interface remains legible and responsive.

Physical motion accuracy, native permission UX, haptic support, real Wi-Fi end-to-end latency, safe-area behavior, and installed-app wake-lock behavior are **unverified** until this checklist is completed on hardware. Automated viewport screenshots do not simulate a real notch or Safari browser chrome.

## Recorded results

- `npm run check`: passed TypeScript, ESLint, 53 tests, production builds, and asset budgets.
- `npx playwright test`: 17 passed, including the existing real host/phone integration and Safari touch regressions.
- Controller configuration: 16 passed across Chromium and WebKit.
- Final screenshot/target-size recheck: 2 passed across Chromium and WebKit.

## Changed-file inventory

Only the optional `assisted` field is included in the protocol commit; existing unrelated host-resume edits remain outside these commits.

Controller:

- `web/src/controller/main.tsx`
- `web/src/controller/phone.css`
- `web/src/controller/use-controller.ts`
- `web/src/controller/thumb-controls.tsx`
- `web/src/controller/thumb-input.ts`

Game and protocol:

- `shared/src/protocol.ts`
- `web/src/game/assistance.ts`
- `web/src/game/engine.ts`
- `docs/game-design.md`

Install metadata and icons:

- `web/controller.html`
- `web/public/controller.webmanifest`
- `web/public/controller-icons/paddle.svg`
- `web/public/controller-icons/paddle-192.png`
- `web/public/controller-icons/paddle-512.png`
- `web/public/controller-icons/apple-touch-icon.png`

Tests and verification:

- `tests/thumb-input.test.ts`
- `tests/match.test.ts`
- `playwright.controller.config.ts`
- `tests/e2e/controller-landscape.spec.ts`
- `tests/e2e/game.spec.ts`
- `tests/e2e/mobile-input.spec.ts`
- `tests/e2e/mobile-safari.spec.ts`
- `tests/e2e/polish.spec.ts`
- `docs/controller-testing.md`

Screenshots:

- `artifacts/controller-two-thumb/before-844x390.png`
- `artifacts/controller-two-thumb/before-390x844.png`
- `artifacts/controller-two-thumb/after-844x390-controller-chromium.png`
- `artifacts/controller-two-thumb/after-390x844-controller-chromium.png`
- `artifacts/controller-two-thumb/after-844x390-controller-webkit.png`
- `artifacts/controller-two-thumb/after-390x844-controller-webkit.png`
