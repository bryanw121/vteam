# VTeam icon

Selected direction: Volleyball V, combining a crisp white V monogram with closed volleyball seams and layered Vteam-purple panels. The production assets are derived from `docs/ui-mocks/logo-exploration/vteam-logo-airy-01-purple-panels.png`.

- `vteam-app-icon.png`: 1024×1024 opaque RGB source for the Expo app icon.
- `vteam-favicon.png`: 64×64 browser source; Expo exports `/favicon.ico`.
- `../../public/apple-touch-icon.png`: 180×180 web Add to Home Screen icon.

Previous icon versions remain in Git history. `app.json` points the main app icon and web favicon to these assets; `app/+html.tsx` links the touch icon. Android's existing adaptive icon layers and splash screen are unchanged; those require their own matching asset pass before a native Android release.

Validation: Node 24; `npm run typecheck` passed after the asset update. The app-icon, favicon, and touch-icon sources have been checked at 1024×1024, 64×64, and 180×180 respectively. `npm run build:web` is currently blocked before export by the repository's missing `react-virtuoso` module, independent of these branding assets. No native app or store submission was exercised.

The web deployment publishes the favicon and touch icon. The primary native icon takes effect in a subsequent native build; no store submission is part of this web release.
