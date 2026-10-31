# scripts/shots: before/after screenshots

Screenshots of the web export with every Supabase call answered from fake
fixtures. Nothing reaches the network, there are no secrets to set, and
`*.supabase.co` doesn't have to be reachable. This is how the nightly job shows
what the day's merged frontend PRs changed.

```bash
# Before/after between two refs (screens picked from the files that changed)
npm run shots:compare -- --before <ref> --after <ref> --out shots

# Pick the screens yourself, or pass the changed files
npm run shots:compare -- --before main~3 --after main --screens events-feed,settings-display --out shots
npm run shots:compare -- --before main~3 --after main --files "components/EventCard.tsx app/(app)/host.tsx" --out shots

# Screens for some changed files, without capturing anything
node scripts/shots/affected.mjs $(git diff --name-only main~3 main)

# Capture one export you already built (it must use the mock URL, see below)
EXPO_PUBLIC_SUPABASE_URL=https://shotsmock.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=shots-mock-anon-key npx expo export -p web
npm run shots:capture -- --dist dist --out shots [--screens a,b] [--desktop]
```

`compare` writes `<screen>-before.png`, `<screen>-after.png` and a side-by-side
`<screen>-compare.png` for each screen that changed (identical pairs are
deleted: no channel of any pixel moved by more than `--tolerance`, default 8 of
255, which absorbs Chromium's run-to-run rasterization noise of 1-3 levels;
`--tolerance 0` is exact), plus `summary.json` (also printed) and `index.html` with every
comparison on one page. `--desktop` adds 1280x800 shots next to the 390x844 @2x
mobile ones. `--keep` leaves the temporary worktrees in place for debugging.

## Accessibility check (axe)

`a11y.mjs` opens every screen the same way (`visitScreens` in capture.mjs, with
an `onReady` that runs axe-core instead of taking a screenshot), mobile and
desktop, with tags `wcag2a`, `wcag2aa`, `wcag21aa`:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://shotsmock.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=shots-mock-anon-key npx expo export -p web --clear --output-dir dist-mock
npm run a11y                # compare with a11y-baseline.json; exit 1 on a new serious/critical finding
npm run a11y:baseline       # rewrite a11y-baseline.json from this scan (after fixing findings)
npm run a11y -- --screens host-create,login --mobile-only
```

It writes `a11y-report/a11y-report.json`, `index.html` (every violation: rule,
impact, screen, viewport, sample target, help link) and `summary.md` (the CI job
summary). `a11y-baseline.json` is screen → viewport → rule → node count for
serious and critical rules (counts, not selectors: react-native-web class names
change between builds). A rule new to a screen, or a count above its baseline,
fails; lower counts pass with a note to run `a11y:baseline`; minor and moderate
findings are listed only. Every full run also writes `a11y-baseline.next.json`
(what `a11y:baseline` would write). The committed baseline is CI's: Chromium
fonts on the Ubuntu runner put a few more or fewer contrast nodes on some
desktop screens than other machines do, so when CI and local counts disagree,
copy `a11y-baseline.next.json` from the CI run's `a11y-report` artifact. The comparison and rendering live in
`lib/a11yBaseline.mjs` (tested by `a11y.test.mjs`). Use `--clear` on the
export if you built another export before: Metro can reuse a cached
`lib/env.ts` with a different Supabase URL inlined, and every screen then shows
its error state.

## How it works

- **compare.mjs** checks each ref out in a temporary `git worktree`, links
  `node_modules` when that ref's `package-lock.json` matches one already
  installed (otherwise `npm ci` in the worktree), and runs
  `expo export -p web --clear` against `https://shotsmock.supabase.co`, with
  `TMPDIR` per export so Metro caches don't mix. Both exports are captured with
  the same frozen "now", so unchanged screens come out identical.
- **capture.mjs** serves the export (clean URLs plus the `serve.json` rewrites,
  like `npx serve dist`), opens each screen in a fresh Chromium context
  (America/Chicago, en-US, reduced motion, page clock started at the fixture
  now), runs its actions, waits for requests and fonts to settle (and at least 3s
  after load, past the app's deferred startup reads such as the chat badge),
  and takes the shot. Repeated captures of one export come out the same.
- **lib/supabaseMock.mjs** answers `/rest/v1`, `/rest/v1/rpc`, `/auth/v1`,
  `/functions/v1`, `/storage/v1` and the Realtime websocket with `page.route`.
  Signed-in screens get a fake session in localStorage (`sb-shotsmock-auth-token`)
  before the app loads. Every one-time banner and tour in the checkout is marked
  as seen so none covers a screen.
- **lib/postgrest.mjs** is a small in-memory PostgREST: selects with embeds
  (resolved through the foreign keys in that ref's `types/database.ts`), filters,
  `or`, order, limit/offset, counts, single-row requests, and writes. A table
  or RPC it doesn't know answers `[]`, so a new feature shows its empty state
  instead of crashing; `capture*.json` and the compare summary list those as
  `unmocked`.
- **fixtures/** is the fake world, Maya Chen (@mayachen) and friends in Austin:
  16 players, 4 clubs with posts, 14 events (today, the coming days, a few past),
  outside-venue sessions, 3 tournaments (one upcoming with pools and a
  published schedule, one finished with bracket results, one open), chats,
  notifications, badges and cheers. Dates are relative to now.

## Adding a screen

Add an entry to `SCREENS` in `screens.mjs`: `route`, `signedIn` (default true),
`ready` (text that appears once data has loaded), optional `actions`
(`{ tap: testID, text }` with `text` as the fallback for older refs, `{ click: text }`, `{ scroll: px }`, `{ wait: ms }`), and
`sources`, the globs of files that change it. In globs only `**`, `*`, `?` and
`{a,b}` are special, so route files are written as they are
(`app/(app)/club/[id].tsx`). Shared files (`components/ui`, theme, layouts,
`lib`, `contexts`) select `DEFAULT_SCREENS`. If the screen reads a table the
fixtures don't have, add rows to `fixtures/index.mjs`; if it calls a new RPC,
add a handler in `lib/supabaseMock.mjs`.

`node --test scripts/shots/*.test.mjs` covers the PostgREST mock, the glob
matching and the fixtures (run in CI next to the other script tests).

## Limits

- Only what renders on the web export is covered. Native-only code (`.native`
  files, iOS/Android layout) never shows up.
- Realtime never pushes anything, so live updates (new messages arriving,
  presence) aren't shown.
- Edge functions return `{}` (place search returns no results); maps, images
  from other hosts and Sentry are blocked.
- The screenshot is one viewport. Content below the fold needs its own screen
  with a `{ scroll }` action (see `event-paid-bottom`). `fullPage` exists but
  fixed bars (tab bar, RSVP bar) then sit in the middle of the image, and screens
  that scroll inside a React Native `ScrollView` don't grow at all.
- RLS isn't modelled: every fixture row is visible to the signed-in viewer
  (guest screens see the same rows). The fixtures only include rows the
  viewer could really see.
- `/settings` has no screen of its own: the index route only navigates back.
- `/reset-password` without a recovery link renders its "verifying link" state.
