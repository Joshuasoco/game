# Dink Duel: desktop readability pass

Reviewed at **1440 × 900**, park court, Medium graphics, on November 11, 2026.

## What changed and why

1. **Ball:** increased the visual radius from 0.09 to 0.144 (1.6×), added an ivory outline, a soft height-sensitive contact shadow, a three-axis speed-scaled trail, a fading landing ring, and a short contact-emission pulse so the ball stays legible in flight and on the ground.
2. **Figure and ground:** darkened and desaturated the park, softened the distance with fog, and added a lightweight vignette on every graphics preset so the court and ball take visual priority, including in grayscale.
3. **Characters:** added pale paddle faces and thin jersey edging and lowered the desktop camera from 9.8 to 9.3 with a 34° field of view instead of 40° so player and rival silhouettes appear about 20% larger.
4. **Composition:** moved and shrank the two foreground trees, faded their materials during play, lowered the near fence to 45% height with transparent meshwork, replaced the 500 repeating cones with the existing textured field, and smoothed and set back the hill geometry to remove the angular gray wedge.
5. **HUD:** replaced empty rally content with timing feedback when a timing grade exists, enlarged keyboard hints to 14px and faded them after three scored points, added serving and match-point indicators with deuce handling, and retained the existing live far-fence scoreboard.
6. **Accessibility and gameplay:** preserved physics, scoring, input modes, rivals, quality presets, and existing gameplay features while keeping the ball outline, shadow, and static landing cue available at Low quality and suppressing animated cues under reduced motion.

The held ball is presented beside the serving hand to clear the player's torso; physical ball placement and shot calculations are unchanged.

## Screenshots

| View | Before | After |
| --- | --- | --- |
| Color, 1440 × 900 | [Before](before-1440x900.png) | [After](after-1440x900.png) |
| Grayscale, 1440 × 900 | [Before grayscale](before-grayscale-1440x900.png) | [After grayscale](after-grayscale-1440x900.png) |

The primary comparison uses the same first-serve state, viewport, Medium preset, and park theme; grayscale captures use the browser's CSS grayscale filter.

- [Actual rally: ball, trail and landing marker](rally-1440x900.png).
- [Ball against the court](ball-court-1440x900.png) and [against the kitchen](ball-kitchen-1440x900.png): controlled positions in the real renderer, using the gameplay camera.
- [Isolated sky contrast](ball-sky-isolated-1440x900.png): the real ball, lighting, sky shader, and gameplay camera at 34° FOV, with court and park geometry hidden solely for this contrast check.
- [Match point and live fence score](hud-match-point-1440x900.png) and [Perfect timing indicator](hud-timing-1440x900.png): staged game snapshots in the real app, with the HUD and fence both showing 10:9 and the keyboard hint fully faded.

Visual review: the court boundary is distinct from the field in grayscale, the pale ball has a clear silhouette over both court surfaces and sky, and the near fence and foreground trees no longer mask the playing area.

## Validation

- `npm run check`: TypeScript, ESLint, all **53** unit/integration tests, web/server production builds, and bundle-size gate passed.
- `npx playwright test --output artifacts/readability-full-results --reporter=line`: **17/17** browser tests passed, including phone pairing and Safari touch input.
- After the final bounce-fade adjustment, the renderer regression passed again and `npm run check` remained green.
- New coverage includes match point for both players, tied and extended deuce, hint expiration and rematch reset, ball size and held-ball visibility, Low-quality trail/shadow/marker visibility, contact-pulse decay, marker fading even while physics retains its target after a bounce, and reduced-motion behavior.
- Bundled files total **1.624 MB** with text gzip, within the **2.5 MB** project gate.

## Performance

The reproducible measurement and hardware information are in [performance.json](performance.json); run `node scripts/measure-readability.mjs` with the existing local dev server running.

The script uses Chrome's available GPU, a 1440 × 900 viewport, an explicit Medium preset, four seconds of warmup, ten seconds of real keyboard gameplay, and raw `requestAnimationFrame` intervals rather than the engine's clamped FPS counter.

| Final gameplay measurement | Result |
| --- | --- |
| GPU | AMD Radeon Graphics, ANGLE / Direct3D 11, hardware rendering |
| Browser | Chrome 157, headless |
| Frames / elapsed time | 599 / 10.004 seconds |
| Average frame rate | **59.88 FPS** |
| 95th-percentile frame interval | **16.8 ms** |
| Intervals over 33.3 ms | **0** |
| Sample composition | 341 rally frames, 253 serve frames, 5 point-transition frames |

**Laptop classification is unverified:** the browser identifies the GPU and logical CPU count, but does not establish the laptop model, power profile, or thermal state; this short development-server sample is not a sustained production hardware certification.

An initial diagnostic sample overlapped several software-rendered browser tests and measured 12.39 FPS; after those tests stopped, a separate ten-second sample measured 60.08 FPS with a 16.8 ms 95th-percentile interval and no intervals above 33.3 ms, which is why the saved gameplay measurement is run separately from the regression suite.
