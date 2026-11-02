# Approved badge PNGs

All 36 badge tiers are mapped by static `require` calls in `constants/badgeArtwork.ts`. The new images are transparent 256×256 PNGs; Vex keeps its original image bytes and dimensions. Original hosted files remain untouched.

Design approval and the reviewed collection are under `docs/ui-mocks/badge-artwork/`. Artwork is bundled and cached; nothing generates images, charges an image API, or queries a new table at render time. Existing award thresholds and saved display-tier choices are unchanged.

When adding a badge tier, add its PNG and static mapping. The catalog coverage test and `scripts/shots/badge-artwork-flow.mjs` check that every tier has the correct renderable file. The browser flow also verifies selecting a lower earned tier and preserving it across reload.
