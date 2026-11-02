# VTeam icon

Selected direction: Volleyball V, combining a V monogram with volleyball seams on a purple field. Approved in the artwork chat before implementation.

- `vteam-app-icon.png`: 1024×1024 opaque RGB source for the Expo app icon.
- `vteam-favicon.png`: 64×64 browser source; Expo exports `/favicon.ico`.
- `../../public/apple-touch-icon.png`: 180×180 web Add to Home Screen icon.

The original icon files are retained. `app.json` points the main app icon and web favicon to the new files. `app/+html.tsx` links the touch icon. Android's existing adaptive icon layers and splash screen are unchanged; those require their own matching asset pass before a native Android release.

Validation: Node 22; `npm run build:web`, `npm run typecheck`, and `npm run docs:check` passed. The real static export loaded in installed Chrome through Playwright at 1280×800 and 390×844 with mocked Supabase data. Both document icon links returned 200. The served favicon was decoded and compared to the selected artwork; the served touch icon matched the configured asset byte-for-pixel. No native app or store submission was exercised.

The web deployment publishes the favicon and touch icon. The primary native icon takes effect in a subsequent native build; no store submission is part of this web release.
