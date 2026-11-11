# Dink Duel art bible

## Point of view
A well-used neighborhood pickleball club, made as a small wooden-and-clay diorama. Cozy, confident and sporty. Objects look touched by hands, not rendered in polished plastic. The live court remains real 3D procedural geometry; image generation supplies references and small textures/portraits, never models.

## Palette (10 colors)
| Role | Hex |
|---|---|
| Evergreen / text | `#193f35` |
| Sage court | `#93ad8c` |
| Cream paper | `#f5f1df` |
| Clay accent / Rocket | `#bd623f` |
| Dusk violet / Mabel | `#71628d` |
| Foliage shadow | `#52674e` |
| Warm pavement | `#c5a78b` |
| Skin / wood highlight | `#d6ac87` |
| Ball / warm light | `#e5d48a` |
| Paper highlight | `#fffdf1` |

UI text uses evergreen on cream, cream on evergreen, or foliage shadow on paper. Accent colors are decoration; score labels and numerals carry identity independently of color. `web/src/tokens.css` is the UI token source. Automated contrast checks cover normal-text pairings.

## Shape and light
- Chunky rounded forms; heads about one third of standing character height. Small hands, readable paddles, grounded shoes. No floating limbs.
- Hat silhouettes distinguish Pip (cap), Rocket (visor), Mabel (sunhat), June (headband).
- Soft warm key from upper left; long soft shadows, matte surfaces and restrained grain.
- Grain stays on world materials or paper at low opacity. Do not dirty the ball silhouette or typography.
- Portraits are chest-up, turned slightly inward. Expressions are understated.
- Six paddle skins use simple club motifs: evergreen stripe, clay sun, sage checker, violet arch, cream court diagram, and June's champion band.

## Never
No neon, glossy gradients, metallic sports UI, huge celebratory text over play, photorealistic faces, chibi proportions, extra fingers, stray lettering, warped equipment, decorative UI borders on active play, mismatched light direction or unlicensed external art. No full-resolution 1024 px raster served as an in-game icon.

## Generation and curation
Build-time only. Store exact prompts in `art/prompts`, raw candidates outside the public asset directory, selection reasoning and SHA-256 in `art/manifest.json`. Generate four variants per requested asset; selection is explicit, never “first output wins.” The style frame must be selected as the reference before later edits. Automated format checks do not constitute human art approval; record the reviewer and preserve pending review honestly.

The API runner verifies model access and uses `images/generations` for the initial frame, then `images/edits` with the selected frame for every later asset. Raw outputs are 1024 px PNG. The postprocessor trims alpha, snaps selected colors while preserving alpha, downsizes, encodes WebP/AVIF, checks repeat edges for tiling, builds a UI atlas and emits CSS/TS asset maps. Candidates with text/anatomy/style problems are rejected in the manifest, not silently overwritten.

## Verified API contract — 11 November 2026
The official [generation reference](https://developers.openai.com/api/reference/resources/images/methods/generate) states that `gpt-image-1` was retired on 23 October 2026. The runner defaults to `gpt-image-2.5-sunburst`, checks account access first, and allows an explicit `OPENAI_IMAGE_MODEL`. It requests `1024x1024`, `quality: high`, PNG output and opaque/transparent background by asset kind. The official [edit reference](https://developers.openai.com/api/reference/resources/images/methods/edit) documents multipart `image[]` reference uploads. Account-specific model access cannot be inferred without a key.
