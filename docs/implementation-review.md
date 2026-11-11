# Seven-phase review

The repository was initialized from the existing playable build; the baseline commit is `5a881e7`. Original features, the 22 baseline tests, Docker and CI remain. No hosted service or measured physical-device result is implied by these commits.

| Phase             | Commit             | Review images               | Validation                                                                                                                                    |
| ----------------- | ------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline          | `5a881e7`          | [Before](reviews/baseline/) | Existing game; screenshot helper had a lint-global issue recorded in audit                                                                    |
| 1 — Game-first UI | `d5e4f45`          | [After](reviews/phase-1/)   | Full viewport, edge HUD, match-local results; 22 tests and 2 browser tests pass                                                               |
| 2 — Depth         | `6d847ca`          | [After](reviews/phase-2/)   | Drop, timing, spin, intent and data-driven rivals; 27 tests pass                                                                              |
| 3 — Feel          | `47e00ea`          | [After](reviews/phase-3/)   | Pooled particles, contact squash/recoil, hit-stop, camera and reactions; 27 tests pass                                                        |
| 4 — Audio         | `747249f`          | [After](reviews/phase-4/)   | Original synthesized layers, three adaptive stems and channel controls; 27 tests pass                                                         |
| 5 — Controller    | `8d6074f`          | [After](reviews/phase-5/)   | Live tilt/strength, thumb controls, mirroring and settings; 27 tests and 2 browser tests pass                                                 |
| 6 — Art           | `38946dd`          | [After](reviews/phase-6/)   | 57 candidates including a targeted correction, 14 selected jobs, 31 production images/atlas entries; 30 tests and 2 browser tests pass        |
| 7 — Quality       | Final phase commit | [After](reviews/phase-7/)   | Art integrity/source preservation, quality/accessibility controls, local opt-in counters, regression fixes; 33 tests and 4 browser tests pass |

Each image directory contains desktop title, pairing and play at **1440×900**, plus the phone controller at **390×844**. Compare to the previous phase directory for before/after. Screenshots are actual browser renders; art references are labeled separately under `art/reviews`.

## Scope choices

- Keep the original native SVG control system and accessible wordmark; the generated icon atlas appears in shot help, portraits appear in title/HUD, and six skins are selectable on the phone.
- Use small textures only where their measured repeat-edge error passes the build check. Preserve selected full sources outside `web/public`, so processing is reproducible from a checkout.
- Add quality hooks alongside the material integration so new artwork has a bounded renderer budget. The final phase adds validation and closes integration defects.
- Defer the optional replay camera; live timing and court readability take priority over an additional playback timeline.
- Art selection is assistant curation. The manifest correctly records human approval as pending. The build-time API runner is implemented, but no account-specific generation or access has been verified without an environment key. The included images came from the built-in image tool, whose underlying model is not exposed.

## Verified and unverified

Typecheck, lint, all tests, production build and bundled-asset budget pass locally. Browser checks cover full-viewport play, settings, reduced motion, opt-in default, landscape touch layout, skin switching, rival naming, pairing and reconnect with score preservation. The JS/CSS gzip payload is about **1.103 MB**; `npm run check:budget` also reports all bundled images. External font transfers are excluded from that build-size check.

Physical iOS/Android swing accuracy, local Wi-Fi swing-to-screen latency, real laptop/controller FPS, hosted HTTPS, autoplay/haptics on actual Safari, and human curation remain unverified. Follow [the ten-point phone checklist](playtest-checklist.md) before calling these gates complete.
