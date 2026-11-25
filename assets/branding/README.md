# VTeam icon

The logo is the slanted white V on a purple (`#7C4DFF`) tile, drawn once as a vector in `vteam-logo.svg`. Every PNG is rendered from that shape:

| File | Size | Shape |
| --- | --- | --- |
| `vteam-app-icon.png` (`app.json` icon) | 1024 | full bleed (the OS rounds it) |
| `../vteam.png` (web favicon), `vteam-favicon.png` | 64 | rounded tile |
| `../splash-icon.png` | 1024 | rounded tile |
| `public/apple-touch-icon.png` | 180 | full bleed |
| `public/icon-192.png`, `public/icon-512.png` (manifest, also maskable) | 192, 512 | full bleed, V inside the 80% safe zone |
| `../android-icon-foreground.png` / `-monochrome.png` | 1024 | V only, inside the adaptive icon's 66% safe zone, transparent |
| `../android-icon-background.png` | 1024 | solid purple |

To change the logo, edit `vteam-logo.svg` and render every size again at the same sizes (any SVG renderer; the PNGs were made with headless Chromium). The native icons take effect in the next native build.
