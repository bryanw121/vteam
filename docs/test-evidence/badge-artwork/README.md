# Badge artwork release verification

Executed on November 2, 2026, with Node 22 and installed Chrome through Playwright. All people/data in the screenshots are the repository's synthetic fixtures. No production database or stored badge state was modified.

- `npm run typecheck`: passed.
- `npm test -- --runInBand --coverage`: 92 suites / 1,130 tests passed; coverage floors passed.
- `node --test scripts/*.test.mjs scripts/shots/*.test.mjs`: 39 tests passed.
- `npm run docs:check`: passed after regenerating the inventory.
- Fresh web export: passed (`CI=1 EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_SUPABASE_URL=https://shotsmock.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=shots-mock-anon-key npx expo export -p web --clear --output-dir dist-mock`). Use `--clear` when changing build environment: an older transform cache retained a production Supabase module in an earlier local mock export; that artifact was discarded and rebuilt before verification.
- `SHOTS_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/shots/badge-artwork-flow.mjs --dist dist-mock --out shots/badge-artwork`: passed. On CI the installed Playwright Chromium is used without `SHOTS_CHROMIUM`.
- Browser flow: all 36 PNGs in 12 desktop/mobile scenarios (locked, then tiers 1–5), with expected labels, selected tiers, HTTP 200 and byte-for-byte served-file checks. It also opens the real picker, selects Regular while Legend is earned, and verifies Regular's silver image after reload on both viewports. See [result.json](result.json).
- Regression mutation: forcing all images to tier 1 made `BadgeIcon.test.tsx` fail. The original source was restored, then the full suite passed.
- Icon check: the static export's favicon and Apple touch icon loaded in desktop/mobile Chrome. The decoded favicon matched selected artwork (mean RGB channel difference 2.437 from Expo's resampling); the touch icon pixels matched exactly. The primary app icon is opaque RGB at 1024×1024.
- Vex: bundled PNG bytes equal the preserved original.

Screenshots: [desktop earned](desktop-earned.png), [mobile earned](mobile-earned.png), [desktop locked](desktop-locked.png), [mobile locked](mobile-locked.png), [desktop pinned tier](desktop-pinned-tier.png), [mobile pinned tier](mobile-pinned-tier.png).

Not exercised: native iOS/Android builds or app-store submission. The web release is the deployment target; the selected primary app icon is prepared for a later native build. Android adaptive layers remain unchanged.
