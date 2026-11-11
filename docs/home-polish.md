# Dinkduel home-screen polish

Implemented November 11, 2026. Gameplay rules, physics, game timing, controller input,
motion permission handling, and networking are outside this change.

## Before and after

Before: a narrow 365px card forced three native dropdowns into a single row, with
9–10px labels and clipped option text. The court floated against a static sky
image. Tree crowns were stacked spheres and furniture used sharp box shapes.

After: a 410px card uses native radio inputs styled as segmented controls, with
arrow-key navigation, readable 13–14px labels/captions, explicit checked marks,
stable accessible names, and a teal keyboard focus outline. The menu scrolls on
small screens. Buttons have coordinated hover, press, and transition states.

The park now has a gradient sky, soft cloud forms, fog and layered hills, instanced
grass, hedges, a small clubhouse, and a decorative club scoreboard. Rounded foliage
lobes have varied colors and gentle wind sway. Court edges, wooden bench slats,
armrests, fence caps and planter rims have bevels/details. Court and painted lines
use deterministic grain with bump/roughness variation. Baked contact shading works
at every preset. Warm sunlight, cool hemisphere fill, a cool rim light and biased
PCF soft shadows add depth. Menu characters are 12% larger, breathe and bounce a
ball. Mouse parallax and the intro dolly respect reduced motion.

The scoreboard is an environmental decoration; the existing gameplay HUD remains
the authoritative score display.

## Renderer decision

This repository uses an imperative Three.js `CourtScene`, not an R3F Canvas.
`@react-three/postprocessing` requires the R3F context/render loop. To preserve the
existing architecture and game timing, this implementation uses its underlying
`postprocessing` package directly, without installing Fiber or migrating the scene.
See the official [React wrapper documentation](https://github.com/pmndrs/react-postprocessing)
and [composer documentation](https://github.com/pmndrs/postprocessing).

HDR composer rendering uses half-float buffers and a final ACES effect, avoiding
double tone mapping. Low uses renderer ACES directly. Switching to Low restores
automatic framebuffer clearing. Composers, shadow maps and procedural textures
are disposed during preset changes or scene teardown as appropriate.

## Quality presets

| Setting | Rendering |
| --- | --- |
| Auto (new default) | Starts at Low for coarse pointers, <=4 CPU threads, or <=4GB reported memory; otherwise Medium. After four seconds of warmup, steps down if three seconds of frames average over 19ms. Hidden tabs are excluded. Explicit presets stay fixed. |
| Low | DPR cap 1; direct ACES rendering; baked contact shading; no shadow maps, composer or impact particles. |
| Medium | DPR cap 1.25; 1024px PCF shadows; subtle bloom, vignette, slight desaturation, ACES and FXAA; reduced particles. |
| High | DPR cap 1.5; 2048px PCF shadows; Medium effects plus half-resolution normals/SSAO and gentle depth of field at 35% resolution. The depth-of-field pass is disabled during gameplay. |

Saved Low/Medium/High preferences are preserved. Auto only lowers quality within a
session, avoiding repeated quality oscillation. A reload or explicitly reselecting
Auto starts detection again. Settings > Quality allows effects to be disabled.

## Performance measurements

Environment: browser automation against the Vite development server, 1440×900 CSS
pixels, DPR 1, 12 reported CPU threads, AMD Radeon integrated graphics through
ANGLE/Direct3D11. Each idle home-screen sample contains 180 requestAnimationFrame
intervals. After samples were taken after five seconds of warmup, with other
browser regression tests stopped. These are frame-pacing measurements, not GPU
timer queries or a guarantee for every laptop, resolution, or gameplay workload.

| Version / preset | Mean FPS | Median frame | p95 frame |
| --- | ---: | ---: | ---: |
| Before, existing default | 60.16 | 16.70ms | 17.60ms |
| After, Low | 60.22 | 16.70ms | 18.00ms |
| After, Medium | 60.00 | 16.70ms | 17.80ms |
| After, High | 56.47 | 17.10ms | 23.90ms |
| After, Auto → Medium | 60.01 | 16.70ms | 17.70ms |

High was measured again after reducing normal and DOF working resolutions; its
mean frame interval was 17.71ms. Medium/Auto are the recommended choices for this
integrated GPU. An earlier unoptimized High sample averaged 52.03fps.

Build size: approximately 1.135MB gzip for all JS/CSS including physics, and 1.591MB
for all bundled assets with text gzip, below the existing 2.5MB budget. External
Google Fonts are excluded by the existing size check. The build still reports its
large Three.js/physics chunk advisory.

## Validation

- TypeScript, ESLint, production web/server builds and asset budget check.
- 41 unit/integration tests, including real WebSocket relay/recovery and complete
  simulated matches. Socket tests require localhost access outside the sandbox.
- All seven selected browser regressions passed. Coverage: phone pairing, calibration, serving, pause/resume, reconnect,
  keyboard play, narrow layout, rival selection, phone landscape/skin changes,
  native radio keyboard behavior, all quality settings, and reduced motion.
- Existing Rapier initialization deprecation warnings remain.

## File inventory

| File | Change |
| --- | --- |
| `web/src/screen/main.tsx` | Replaces menu selects with reusable segmented radio groups; prevents game shortcuts from intercepting focused UI controls. Pre-existing and concurrent networking edits were preserved and excluded from these commits. |
| `web/src/screen/choice-group.tsx` | Accessible generic radio group with native keyboard behavior and stable names. |
| `web/src/screen/game-ui.css` | Card layout, type scale, segmented controls, focus/hover/press states and responsive scrolling. |
| `web/src/screen/scene.ts` | Lighting, environment integration, bevels/detail, camera/idle motion, quality application/adaptation and cleanup. |
| `web/src/screen/environment.ts` | Gradient sky, clouds, hills, foliage/wind, grass instancing, hedges, clubhouse, decorative scoreboard and contact shading. |
| `web/src/screen/art-surface.ts` | Shared deterministic surface grain, roughness/bump maps, worn paint and texture cleanup. |
| `web/src/screen/post-processing.ts` | HDR effect composer, SSAO, DOF, bloom, grading, ACES, vignette and FXAA. |
| `web/src/game/preferences.ts` | Auto quality preference, conservative device detection and saved preset compatibility. |
| `web/src/screen/settings.tsx` | Exposes Auto alongside Low/Medium/High. |
| `web/package.json` | Adds the single `postprocessing` runtime dependency. |
| `package-lock.json` | Locks the added dependency. |
| `tests/polish.test.ts` | Updates default preference expectation; tests device detection and saved presets. |
| `tests/e2e/polish.spec.ts` | Uses the new rival control; adds keyboard, preset, narrow-layout and reduced-motion regression coverage. |
| `artifacts/home-before.png` | Original 1440×900 home screen. |
| `artifacts/home-after.png` | Updated 1440×900 home screen. |
| `artifacts/home-mobile.png` | Updated 390×844 layout. |
| `docs/home-polish.md` | This implementation, performance and file-change report. |

The workspace contained other work in the controller, server, protocol, HTTPS
launcher, CI, README and regression tests. Those changes were not authored or
included as part of the visual-polish commits.
