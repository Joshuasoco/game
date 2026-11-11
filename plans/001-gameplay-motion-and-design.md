# Dink Duel: gameplay motion and design plan

- Date: 2026-11-11
- Baseline commit: `14df1ae`
- Status: software implemented and verified; physical phone and owner motion acceptance pending
- Implementation report: [changes, proof and open acceptance](../docs/gameplay-motion-review.md)
- Priority: character movement and contact first, presentation second
- Scope: desktop game presentation plus consistency with the existing phone controller

## Intended result

Make the game feel like a responsive, polished neighborhood sports game: players plant their feet, turn into shots, make readable contact, recover naturally, and react to points. Keep the wooden-and-clay diorama, evergreen/cream/clay palette, readable court and friendly tone in `docs/art-bible.md`. The proposed motion values below are starting specifications to validate in gameplay, not experimentally established optimal values.

## Direction and alternatives

1. **Recommended: improve the existing procedural characters and presentation.** Retain Three.js, Rapier, React, current art and audio. Add proper transform pivots and a small presentation state model. This directly addresses the current stiffness with the least asset and integration risk.
2. **Effects-only pass.** Faster, but more particles, shake and animated HUD elements would leave the disconnected feet and generic swing intact. Insufficient as the main solution.
3. **Replace characters with authored skeletal models.** Highest animation ceiling, but requires modeling, rigging, clip authoring, licensing/asset review and runtime integration. Defer unless the procedural pass cannot meet the visual acceptance criteria.

Recommendation is the author's proposal, not a user-approved art direction change.

## Baseline evidence

A live headed Chromium session at 1440×900 loaded the menu, started keyboard play, served, showed a rally, and paused successfully. The debug overlay showed approximately 60 FPS in the sampled menu/rally/pause views. This is a spot observation, not a sustained performance benchmark. No page errors appeared; the console reported a Rapier initialization deprecation warning.

Source findings:

| Priority | Location | Confirmed issue | Implication |
|---|---|---|---|
| P0 | `web/src/screen/scene.ts:102–113,715–722` | Legs rotate independently while shoes are direct children of the root; gait uses time and rally state rather than displacement. | Feet cannot plant convincingly; stationary players can keep stepping. |
| P0 | `web/src/screen/scene.ts:627–632,690–712` | Contact sets a signed scalar; a sine wave drives one arm and paddle. | Forehand/backhand have little full-body distinction; no explicit contact/recovery pose. |
| P0 | `web/src/game/engine.ts:697–713` | The ball launches and the visual swing starts on accepted contact; normal and perfect contacts can stop physics for 60/75 ms. | Synchronization needs to be measured before increasing effects or adding wind-up. |
| P1 | `web/src/game/engine.ts:561–570` | Serve preparation sets character positions directly. | A visible transition needs a separate visual offset so rules still see the correct position. |
| P1 | `web/src/screen/scene.ts:595–599,694–712` | Winners bounce and losers sway from a generic reaction scalar. | Rival personality has little expression in point reactions. |
| P1 | `web/src/screen/scene.ts:574–578,688–722` | Reduced-motion setter only changes a flag; several existing transforms/effect states are not explicitly reset there. | Test toggling during movement/impact, including paused states, before adding more motion. |
| P2 | `web/src/screen/game-ui.css:457,508,518,635` | Several different UI surfaces share the same entry animation. | Create a deliberate hierarchy for score feedback, panels and match results. |

The live rally capture shows a clear full-court view and an unobtrusive top scoreboard. Preserve those strengths. Lighting and composition refinements are art proposals, not proven functional defects.

## Invariants and ownership

- `web/src/game/engine.ts` remains the owner of fixed-step movement, hit acceptance, score, AI and point timing. Do not move those decisions into animation callbacks.
- Existing hit windows, reach, physics trajectories, kitchen/double-bounce rules, assistance and shot power must remain unchanged.
- The engine currently reads and writes `Character.group.position` for movement and rules. Keep that root authoritative. Add a child visual body for lean, hops, reset offsets and squash; never apply decorative displacement to the root used for gameplay.
- `web/src/screen/scene.ts` owns scene integration. If needed, extract character geometry/pose evaluation into `web/src/screen/character.ts`; avoid a general-purpose animation framework.
- Continue using Three.js frame updates for 3D; use CSS transforms/opacity for DOM motion. No new animation dependency is necessary.
- Audio and confirmed-contact haptics stay tied to accepted engine events. A whiff must not produce contact sound, contact flash or successful-hit vibration.
- Pause, faults, reconnects, tutorial feeds and rapid inputs must interrupt/reset presentation predictably. No animation may delay an accepted shot or block controls.
- Preserve reduced-motion, graphics presets, controller permissions and existing accessibility semantics.

## Phase 1 — Grounded movement

Files: `web/src/screen/scene.ts`, optional `web/src/screen/character.ts`, focused pose tests under `tests/`.

1. Replace independent leg meshes with hip pivots containing lower-leg/shoe geometry. Add a torso pivot, head pivot, free arm and paddle-arm pivot while preserving silhouettes/materials.
2. Derive travel distance/direction from authoritative root movement. Advance gait by distance (initial stride distance 0.8 world units); stop gait below 0.08 units/second. Ignore discontinuities from serve/reset placement.
3. Use separate lateral shuffle and forward/backward poses. Begin with maximum hip swing 0.28 rad, body lean 0.10 rad and vertical travel 0.025 world units. Blend using `1 - exp(-12 * dt)` so frame rate does not change responsiveness.
4. Keep shoes near ground through the planted half of a step; lift the moving foot by at most 0.06 units. Blend to the ready pose within approximately 140 ms after travel stops.
5. Point resets blend only the visual child's offset back to zero over 240 ms; clear on match restart, practice reset and reduced motion. Do not interpret a reset as running across the court.

Done when: standing characters stop stepping; shoes follow legs; sideways recovery reads as a shuffle; root position and all gameplay results are unchanged. Inspect at 0.25× playback and at 30/60/120 Hz simulated frame intervals.

## Phase 2 — Paddle contact and shot identity

Files: character/scene presentation, narrow event payload changes in `web/src/game/engine.ts`, engine scene stubs/tests.

1. Represent ready, swing/contact, follow-through and recovery explicitly in the character presentation. Keep one active action per character and retarget from the current pose on a new action.
2. Give serve, forehand, backhand, dink, lob and smash distinct shoulder/torso/paddle poses. Use existing shot identity from the engine; do not duplicate shot classification in rendering.
3. Start responsive swing feedback on accepted input where available, without inventing a successful hit. If contact is confirmed immediately, begin at the contact pose rather than playing a delayed backswing after the ball leaves. Anticipatory ready posture may use the existing readiness snapshot, but must not falsely imply a guaranteed hit.
4. Initial timing: 80 ms preparation only when time exists before contact; 100 ms follow-through; 160 ms return to ready. A soft dink uses half the torso rotation of a drive. Whiffs recover within 220 ms and retain existing whiff feedback.
5. Align the paddle face near the actual contact location within the visual rig's reach. Never move the physical ball or expand hit reach to conceal animation errors. If an assisted hit is visually unreachable, document that mismatch for a separate gameplay decision.
6. Capture normal/perfect/AI contacts frame by frame with the existing 0/60/75 ms hit-stop. Keep simulation timing unchanged in this pass. Decide whether a later hit-stop tuning experiment is warranted only after comparison.

Done when: the ball's departure, impact flash and sound occur with a convincing contact pose; forehand/backhand/dink are distinguishable without HUD text; repeated input never queues stale actions; no new input latency.

## Phase 3 — Contact feedback and stable camera

Files: `web/src/screen/effects.ts`, `web/src/screen/scene.ts`, existing audio integration only if necessary.

1. Refine existing pooled particles/ring/trail; do not add another effect system. Keep ordinary contacts restrained and perfect contacts visibly stronger.
2. Replace directionless squash with a brief deformation aligned to contact/ball velocity, recovering over 100 ms. Cap deformation to retain the ball silhouette; start at 1.15 axial / 0.93 transverse scale.
3. Ensure trail length is stable across frame rates by sampling by time or distance rather than only render frames. Reuse the current bounded pool, clear at pause/reset/serve, and keep low-quality behavior inexpensive.
4. Keep the present readable rally framing. Decay a camera offset around a stable base transform instead of accumulating shake into the base. Initial cap: 0.035 world units over 100 ms for strong contacts, no ordinary dink shake.
5. Separate essential ball/landing/readiness visibility from decorative effects. Reduced motion disables shake, FOV kicks, trail and squash; retain a static/high-contrast ball and readable contact/readiness cue.

Done when: contact feels stronger without losing the ball, camera position settles exactly, no trail bridges a reset, and low quality retains all gameplay information.

## Phase 4 — Match presentation and visual design

Files: `web/src/screen/main.tsx`, `web/src/screen/game-ui.css`, `web/src/tokens.css`, character reactions in scene, environment/post-processing only after visual review.

1. Preserve the centered scoreboard, corner controls and open court. Reduce competing tutorial/timing/fault surfaces by giving each a clear purpose; do not hide fault explanations or shorten their existing reading window.
2. Add semantic motion tokens beside existing `--ease` and `--transition`: fast 120 ms, standard 200 ms, panel 240 ms; UI ease-out `cubic-bezier(0.23, 1, 0.32, 1)`. Use transform/opacity only for animated DOM feedback.
3. Animate only the changed score digit (1 → 1.06 → 1 over 200 ms), not the whole scoreboard. Accessible score text updates immediately. Frequent rally counter updates remain immediate.
4. Enter pause/settings/results panels with 8 px vertical travel plus opacity over 200–240 ms; use a 150 ms exit where mounted lifecycle permits it. Rapid open/close must retarget cleanly. Keep keyboard focus and dismissal behavior intact.
5. Give rivals one restrained point reaction each using existing rig transforms: Pip nod, Rocket compact fist pump, Mabel composed paddle acknowledgment, June subtle confident nod. Limit reactions to 600–900 ms inside the existing point window; do not extend point timing.
6. At match end, use a brief winner acknowledgment and readable results reveal; rematch is immediately usable. Avoid full-screen particle showers or text covering live play.
7. Review materials/light at fixed screenshots: soften overly hard contact/shadow treatment, keep matte surfaces, ensure the ball separates from both courts and foliage. Preserve the art-bible palette; tune lighting before replacing assets or adding post effects.

Done when: each state change is easy to read, the court stays unobscured during rallies, rival reactions differ, and results/rematch feel deliberate without waiting on animation.

## Phase 5 — Accessibility, regression and acceptance

1. Reduced-motion changes must take effect immediately mid-swing, mid-impact and while paused. Reset residual camera offsets, body lean/scale and leg poses to defined values. Preserve essential racket/ball action and non-moving status cues.
2. Test keyboard, touch and a real motion-controller phone. A desktop-emulated phone validates layout/relay behavior only; it does not validate sensors, haptics, latency or physical comfort.
3. Add focused deterministic tests for pose transitions, frame-rate independence, reset discontinuities, pause and repeated inputs. Reuse existing engine tests to prove scoring/hit windows are unchanged.
4. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run check:budget`, then relevant Playwright suites: `polish`, `game`, `readability`, `swing-clarity`, plus controller/Safari coverage when its browser is available.
5. Record comparable 1440×900 and 390×844 captures for serve, return, whiff, perfect hit, fault, pause, reset and match over. Include normal and reduced motion, Low and High quality, day and sunset. Review a real-time clip and slow playback; screenshots alone cannot approve motion.
6. Measure a 60-second rally after shader warm-up on target hardware. Aim for p95 frame interval ≤20 ms on the chosen 60 Hz desktop, no persistent memory growth across ten rematches, and no material regression against the same-device baseline. Report browser/GPU/quality; software-rendered tests are not GPU benchmarks.

## Delivery order and approval checkpoints

Implement Phase 1 and Phase 2 as the first reviewable slice. Record before/after gameplay and judge whether movement/contact actually feel better before expanding effects. Then Phase 3, Phase 4 and final regression/physical-device checks. Keep commits coherent by phase. No deployment or new generated assets are required for this plan.

User-facing acceptance: movement feels grounded; each swing is immediate and recognizable; the player can follow the ball through every effect; points and rematches flow clearly; reduced-motion users retain the same gameplay information.

## Baseline verification results

- Existing `tests/e2e/polish.spec.ts`: **3 passed (1.1 minutes)**. Covers viewport/settings/reduced motion, paired touch controller and landscape/skin changes, menu keyboard navigation and graphics presets.
- Used a temporary config in `/tmp` to reuse the running dev server and installed Chromium 1248. Stock local configuration expects missing Google Chrome; the default bundled headless browser revision was also absent. No repository test configuration was changed.
- This verifies baseline behavior only, not the proposed animation changes or real sensor behavior.
- Captures: [menu](evidence/baseline-menu.png), [rally](evidence/baseline-rally.png).
