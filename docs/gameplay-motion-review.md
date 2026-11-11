# Gameplay motion implementation and acceptance

Implemented 11 November 2026 from [the full gameplay motion and design plan](../plans/001-gameplay-motion-and-design.md). Baseline: `14df1ae`. Branch: `feat/gameplay-motion`.

## Delivered software

| Phase | Implementation and proof |
| --- | --- |
| 1: grounded movement | Visual child below the authoritative gameplay root; hip pivots own legs and shoes; separate torso/head/free arm/paddle arm. Distance-driven 0.8-unit stride, lateral/forward poses, bounded foot lift, frame-rate-independent blending and visual-only 240 ms point placement. Deterministic tests at 30/60/120 Hz cover stopping, attachment, root invariants, teleports and pause. |
| 2: shot identity and contact | Engine passes the chosen shot and contact point. Ready/preparation/contact/follow-through/recovery/whiff states replace the signed sine swing. Forehand/backhand, serve, dink/drop, lob and smash have distinct torso/arm/paddle treatment. A fixed-length two-segment arm aims toward reachable contacts. Preparation uses the existing legal input buffer only; confirmed input immediately sets a contact pose. The rig consumes the engine's actual remaining hit-stop, including expiry during pause. |
| 3: contact and camera | Existing particle pool retained. Ball deformation follows outgoing velocity, capped at 1.15 axial / 0.93 transverse and recovered over 100 ms. Trail samples a bounded recycled history at 60 Hz. Strong-hit shake is at most 0.035 units, decays within 100 ms and never changes the stable camera base; ordinary dinks do not shake. Pause/reset/reduced motion clear residual effects. |
| 4: match presentation | Only changed score digits animate; readable score text changes immediately. Semantic 120/200/240 ms motion tokens, opacity/8 px panel entries, contained rival point gestures and a new winner acknowledgment at results. Pause/results retain focus containment, Escape-to-resume and P-to-resume. Tutorial cards are limited to active serve/rally. Ball materials use the art bible's warm ball color with a retained contrasting outline; High-quality ambient occlusion is softened. |
| 5: verification | Full code check, core browser tests, Chromium/WebKit controller tests, deterministic renderer-state captures, before/after gameplay clips and actual Apple M1 Metal measurements. Physical phone acceptance and subjective motion approval remain open. |

Three.js continues to own 3D frame updates; CSS/WAAPI handle DOM feedback. No new dependencies, generated assets or animation framework were added.

## Gameplay invariants

The engine still owns fixed-step motion, hit acceptance, scoring, AI, kitchen/double-bounce rules and point timing. Hit windows, reach, assistance, trajectories, shot power, the 80 ms legal input buffer and the existing 0/60/75 ms physical hit-stop are unchanged. Rendering never moves the authoritative root for gait, reactions, lean, scale or point placement. Whiffs do not invoke contact effects, successful-hit audio or successful-hit haptics. Six real-physics match tests still cover all three difficulties with and without assistance.

Reduced motion takes effect from either Settings or an operating-system preference change. It clears gait, decorative lean, placement offsets, reactions, particles, squash, trail, shake, FOV kick and active score animation. Essential paddle actions, the high-contrast ball, readiness/fault information, landing cue and contact brightness remain available.

## Verification results

- `npm run check`: passed TypeScript, ESLint, **91 tests in 18 files**, web/server production builds and bundled-size gate.
- Core browser coverage: **12 passed** across `game`, `polish`, `readability`, `swing-clarity`, the new `motion` suite and Safari touch calibration/serve.
- Controller landscape/portrait and input coverage: **16 passed**, eight each in Chromium and WebKit. Includes touch, calibration, gestures, permission denial, reconnect, simulated motion, haptic events, wake lock and install assets.
- `git diff --check`: passed before commits.
- Budget: **1.156 MB** gzip JS/CSS; **1.641 MB** total bundled assets with text gzip, under **2.5 MB**.

Browser runs used temporary configurations with this checkout's existing dev server, bundled Chromium (`channel: chromium`) and matching WebKit 2388. The repository's browser configuration was preserved. Matching Playwright browsers were installed locally. A warning-window E2E was initially timing-sensitive; its clock now pauses while inspecting and pressing during WAIT_BOUNCE. The final complete 12-test run passed in 33.9 seconds. The complete controller run passed in 31.0 seconds.

The existing Rapier initialization deprecation and Vite large-chunk warning remain. They did not fail any required check.

## Hardware measurement

Both samples used headed Chromium 156, **Apple M1 via ANGLE Metal**, High quality, 1440×900 and device scale factor 1. Each run warmed shaders for five seconds, then measured a 60-second assisted autoplay session with the real engine and renderer. Statistics below include only rally frames; point/serve transitions were also present. This is a focused local sample, not a sustained continuous-rally or broad device benchmark. No recording was enabled during measurement.

| Metric | Baseline | Final source after review fixes |
| --- | ---: | ---: |
| Rally frames sampled | 2,985 | 2,984 |
| Median rally frame interval | 16.7 ms | 16.7 ms |
| p95 rally frame interval | 17.6 ms | **18.4 ms** |
| Maximum sampled rally frame interval | 17.8 ms | 18.8 ms |
| Total frame callbacks over 60 seconds | 3,601 | 3,600 |

The final sample remains below the plan's 20 ms p95 target. Its p95 is 0.8 ms higher than the baseline; a single before/after sample does not isolate measurement variance from code cost. An earlier intermediate sample was 17.3 ms; the table deliberately reports the refreshed final source.

Across ten rematch resets, final renderer counts remained **220 geometries, 41 textures and 33 shader programs**. Post-GC JavaScript heap changed from approximately **23.58 MB to 23.63 MB**, ending in a stable narrow band. This shows no accumulating render resources or sustained heap growth in that sample; it is not a general leak guarantee. [Raw samples](reviews/gameplay-motion/performance.json) preserve every measurement.

## Local visual evidence

The git-ignored evidence remains in this checkout under `output/playwright/`:

- [Review viewer](../output/playwright/motion-review.html): before/after actual keyboard gameplay, a footwork/shot presentation study, 1× and 0.25× playback, frame-step controls and the complete final capture gallery. Open the HTML in a browser.
- [Actual gameplay after](../output/playwright/motion-gameplay-after/): 1440×900 gameplay clip plus serve/rally/pause captures.
- [Final hardware renderer studies](../output/playwright/motion-final-hardware/): **32 captures** of serve, return, whiff, perfect hit, fault/point reaction, pause, reset and match-over acknowledgment. Four configurations cover 1440×900 / 390×844, Low / High, day / sunset and normal / reduced motion. These directly drive presentation states in the real renderer and do not show the full game's HUD.
- [Footwork and shot study](../output/playwright/motion-showcase/): lateral travel, stopping, forward travel and six shot poses in real time. This drives presentation directly; the before/after clips separately show actual game input.

High-quality SwiftShader captures showed large white rectangles in both the original baseline and changed source. Identical Apple M1 Metal captures were clean. Native hardware captures are the visual evidence; the older software-renderer images are retained only for diagnosis. No workaround was added to the game's post-processing for that environment-specific artifact.

## Review findings and decisions

A fresh read-only review found five Important issues. All were reproduced and fixed: a second hit-stop clock diverged on pause, saved reduced motion could initialize the camera at the origin, Resume autofocus swallowed P, a point could retain pending preparation, and match-over lacked its winner acknowledgment. Focused regression tests and the final full check passed. No code-style minors were deferred.

Decisions made while implementing the plan:

1. Confirmed hits start at contact. Only the existing buffered near-hit input may prepare. This preserves responsiveness; there is no newly delayed backswing or new success prediction.
2. Presentation consumes the remaining engine hit-stop rather than tuning it or maintaining another timer. The existing physical behavior, including timer expiry during pause, remains authoritative.
3. Point placement animates only the visual child. Match restart and practice feeds clear placement instead of simulating a run across the court.
4. Panels exit immediately with their existing React unmount lifecycle. No artificial mounting delay was added to focus restoration, dismissal or rematch. Entry transitions remain interruptible.
5. The rig keeps its **0.95-unit arm reach**. Pip/Easy accepts up to **1.5 units of planar reach**, plus height differences, so some extreme assisted/high contacts remain visually unreachable. The arm is not stretched and neither ball nor hit acceptance is moved to hide that gap. Changing that relationship requires a separate gameplay/rig decision; the remaining cost is a visible gap on some accepted hits.
6. Renderer studies, simulated controller tests and hardware samples are evidence for their specific conditions. They do not substitute for real phone sensors, comfort or owner approval of how motion feels.
7. The pre-existing High/SwiftShader artifact does not justify replacing established native post-processing. Software rendering can remain visually degraded; the native hardware evidence is clean.

## Open acceptance

- Test a real iPhone/Android motion controller over HTTPS: permission, calibration, swing recognition, tilt, haptics, network latency and physical comfort.
- Review the clips in real time and at 0.25×. Confirm grounded movement, clear forehand/backhand/dink identity and readable ball departure on actual input. Visual judgment remains the owner's acceptance step.
- Decide separately whether extreme accepted contacts should use a longer/modified rig or different gameplay assistance. No policy change was made here.

To play the changed source, run `npm run dev:https`, open its current HTTPS URL on the laptop and scan its QR on the phone. Do not start a second copy if the existing game is already running. Nothing was deployed or pushed.
