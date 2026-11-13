# vteam — Steering Document

## What This App Is
A volleyball club app. Members find and join open play sessions and tournaments, track their stats and reputation, and get notified about club activity. Built with React Native + Expo for iOS, Android, and web.

---

## Product Roadmap & User Stories

### ✅ Done / In Progress
- **Calendar view for events** — week and month views, event dots, daily event list

### 🔲 To Do

#### Event Tags
- Events are tagged as **"open play"** or **"tournament"** (predefined list, extensible later)
- Host selects the tag(s) when creating an event
- Users can filter the event feed by tag

#### Teams
- Both open play and tournament events support teams
- Teams are **randomized by default**
- Host can pin specific players to be on the same team before randomization runs
- Team assignment happens after the RSVP window closes / host triggers it

#### Points System
- Users earn points by attending events — points are awarded **only after the event ends**
- If a user leaves an event before it ends, they earn **no points**
- Point values by event type:
  - Open play → **2 points**
  - Tournament → **5 points**
- Points accumulate on the user's profile (no spending mechanic yet — designed so one can be added later without restructuring)

#### Kudos
- After an event ends, attendees can give kudos to other players who attended the **same event**
- Each user can give up to **5 kudos per event** (distributed however they like across other attendees)
- Kudos are displayed as a count on the recipient's profile

#### Profile — Position & Kudos
- Users set their volleyball position on their profile
- Positions: **Setter, Libero, Outside Hitter (OH), Defensive Specialist (DS), Opposite Hitter (OPP)**
- Profile shows total kudos received and points accumulated
- Profile shows previous events attended

#### Notifications
- Build notification infrastructure so triggers can be added incrementally
- Example trigger: user receives kudos
- Full trigger list to be defined later — do not hardcode a fixed set

#### Tournaments Tab
- Separate tab showing upcoming and past tournaments
- Tournament structure:
  1. **Pool play** (group stage)
  2. **Single elimination bracket** (default; bracket type configurable by host)
  3. **Trophies** for 1st, 2nd, 3rd place (ties for 3rd are allowed)
- Host configures rules when creating the tournament (bracket type, tie rules, team pinning, etc.)
- Trophy winners are stored on the winner's profile

#### Feature Requests & Bug Submission
- A form in the Profile tab lets users submit feedback
- On submit, sends an email to **bryan.wu.121@gmail.com**
- The destination email should be stored in a single config constant (not hardcoded in the form) so it can be changed easily

#### Forgot Password
- Standard password reset flow via Supabase Auth email

#### Security
- Details TBD — implement standard best practices (input validation, RLS policies in Supabase, no secrets in client code)

#### Ads *(future — design with this in mind)*
- Two ad formats planned: **banner ads** and **sponsored events** in the feed
- Points will eventually be usable to remove ads
- No implementation needed now, but avoid coupling the feed and profile screens in ways that make inserting ads painful

#### Migrate Reclub Profile *(parked — details TBD)*
- Users will eventually be able to import their profile from a separate platform called "reclub"
- Scope and data mapping TBD

---

## Tech Stack
- **React Native 0.88 / Expo SDK 58** with Expo Router (file-based routing). A custom `app/+html.tsx` must render `headNodes` / `bodyNodes` from `useServerDocumentContext()` (the app scripts arrive there)
- **React Native Web** for browser support
- **Supabase** for auth (email/password) and PostgreSQL database
- **TypeScript** (strict mode)

## Project Layout
```
app/                         # Expo Router routes (screens compose hooks + components)
  _layout.tsx                # Root: providers, auth redirect (guest gate via utils/authGate)
  +html.tsx                  # Web document shell
  (auth)/                    # login, register, reset-password
  (app)/
    _layout.tsx              # Stack + desktop-web sidebar (derives from constants/navigation)
    (tabs)/
      _layout.tsx            # Mobile bottom tab bar + create menu
      (main)/
        _layout.tsx          # Pager hosting the four tabs (swipe on native + web)
        index.tsx            # Events tab (calendar + feed)
        profile/index.tsx    # Profile tab
        clubs.tsx            # Clubs tab
        chat.tsx             # Chat tab (conversation list)
      settings/              # account, friends, hosted, history, cheers, silenced, hidden, notifications, feedback, badges, metrics/ (admins)
    event/[id].tsx           # Event detail (re-exports components/event/EventDetailRoute; web loads the screen lazily)
    club/[id].tsx, club/create.tsx
    chat/[id].tsx            # Conversation
    profile/[id].tsx         # Another user's profile
    tournament/[id].tsx, tournament/create.tsx
    host.tsx                 # Create / edit event, templates
    notifications.tsx
    welcome.tsx              # Player setup after sign-up (#156): position, level, city; opened once by usePlayerSetupGate
components/
  ui/                        # Design-system primitives (see "UI primitives")
  event/ events/ host/ profile/ tournament/   # Feature components for those screens
  (top level)                # Shared widgets: Button, Input, EventCard, Pager, Toast, MessageBubble, ...
hooks/
  event/                     # useEventData, useEventAttendance, useEventComments, ... (keys.ts, derive.ts)
  tournament/                # api.ts + useTournamentData / useTournamentActions
  (top level)                # One hook per concern: useMyProfile, useMonthEvents, useConversations, useMessages, ...
lib/
  query.ts                   # useQuery / useMutation / invalidate / setQueryData (module-level cache)
  realtime.ts                # useRealtimeChannel (ref-counted channel registry)
  supabase.ts                # createClient (the only client)
  env.ts, sentry.ts, sessionUser.ts, ...
contexts/                    # session.tsx (the one auth listener), tabs.ts (pager/shell state), webNav.ts
constants/
  theme.ts                   # Design tokens (colors, gradients, spacing, font, radius, shadow)
  styles.ts                  # Shared StyleSheet (`shared.*`)
  navigation.ts              # TABS, CREATE_MENU, tab helpers: the only definition of the tab bar
  layout.ts                  # BREAKPOINTS
  cache.ts                   # STALE windows
  selects.ts                 # PostgREST select fragments
  copy.ts, tournamentCopy.ts # User-facing strings and labels
  index.ts                   # Barrel: import { theme, shared, STALE, ... } from constants
types/
  database.ts                # GENERATED from the live schema: do not edit by hand
  index.ts                   # App types derived from it
utils/
  routes.ts                  # routes.* builders, isAppPath, toRoute
  authGate.ts                # Which paths need an account; post-sign-in redirect
  index.ts                   # Date and formatting helpers (cleanDate, formatEventDate, ...)
e2e/, __tests__/, supabase/ (functions + migrations), scripts/, docs/
```

## Database Schema
The schema lives in Supabase; `types/database.ts` is generated from it
(`supabase gen types`) and is the source of truth for tables, columns, views and RPC
signatures. Regenerate it after every schema change; never hand-edit it. Key domain tables:

- **profiles**: one row per user (auto-created on signup); public columns are in `PROFILE_BRIEF_SELECT`
- **events** / **event_attendees** (and the `event_attendees_attending` / `_waitlisted` views) / **event_guests** / **event_cohosts** / **event_comments** / **event_tags** + **tags**
- **user_event_templates**: saved host templates
- **external_sessions**: sessions from other Austin venues (read-only here)
- **external_programs**: leagues and tournaments run outside vteam, from Schelagg (read-only here)
- **clubs** / **club_members** / **club_posts** (+ comments, likes)
- **conversations** / **conversation_members** / **messages** / **message_reactions** / **chat_silences**
- **tournaments** and its children (`tournament_teams`, `_team_members`, `_matches`, `_pools`, `_rules`, `_prizes`, invitations, join requests, comments)
- **cheers**, **user_badges**, **notifications**, **push_tokens**, **feedback_submissions**
- **friend_requests** / **friendships** (see "Friends")
- **app_events**: insert-only usage metrics (see "Usage metrics"); **app_events_daily**: their per-day totals, kept forever

Also **user_settings** (private per-user settings: home city, seen banners, reminder lead time, notification switches, what they hid from the feed), **event_reminder_log** (service-only reminder dedupe), **app_admins** and **event_attendee_denials** (see "Private data stays off public rows").

Custom RPCs include `get_my_conversations`,
`get_event_card_attendee_previews`, `get_feed_span` (the Events feed for a date range in one call; `useMonthEvents` falls back to separate queries if it is missing), `mark_conversation_read`, `mark_notification_read`.

## Key Architectural Decisions

### No third-party state management
Only React hooks (`useState`, `useRef`, `useContext`). Server state lives in `lib/query` (module-level cache behind `useQuery`/`useMutation`); global UI state lives in context (`SessionProvider` for auth, `TabsShellContext`/`TabsActiveContext` for the pager).

### Custom tab navigation
The app does NOT use Expo Router's built-in `<Tabs>`. Instead: a custom `<Pager>` (`(tabs)/(main)/_layout.tsx`) + a custom bottom bar (`(tabs)/_layout.tsx`) on mobile and a sidebar (`(app)/_layout.tsx`) on wide web. Swiping between tabs, and iOS swipe-back on stack screens, are off in the native apps (they kept navigating by accident) and live behind `SWIPE_NAVIGATION` in `constants/navigation.ts`: flip `tabs` or `back` to bring either back (`calendar` does the same for swiping the Events week strip, off on every platform; its ‹ › arrows change the week), and give every new `<Stack>` `gestureEnabled: SWIPE_NAVIGATION.back` (`__tests__/swipeNavigation.test.ts` checks). Narrow web renders the tabs statically, and the browser's own swipe-back is the browser's. All three derive from `TABS` / `CREATE_MENU` in `constants/navigation.ts`: add, reorder or rename a tab there and nowhere else. `useTabsShell()` (`contexts/tabs.ts`) lets child screens call `goToTab(index)` without circular imports; use `useTabsActive()` only where the active index is needed (it re-renders on every switch).

### Cross-platform components use `.web.tsx`
`DatePickerField.tsx` = native (`@react-native-community/datetimepicker`).
`DatePickerField.web.tsx` = HTML5 `<input type="datetime-local">`.
Metro/webpack picks the right file automatically.

### Web static render and hydration
The web export pre-renders HTML at build time, with no viewport, session, clock or device storage. On web the root layout (`app/_layout.tsx`) renders only the splash until the client has hydrated, then mounts the app tree (still under the splash). So screens may branch on window size, `useSession()`, `Date` or `localStorage` freely; don't move app UI outside that gate, or React error #418 (hydration mismatch) comes back. The guest e2e spec checks for it. The one thing deliberately outside it is the browser tab title, `<Head><title>{APP_NAME}</title></Head>` (`APP_NAME` in `constants/copy.ts`): a constant, so the export bakes it into every page; without it Expo Router leaves an empty `<title>` and tabs read "Untitled".

### Cold start on web: paint from the device first
A cold Supabase project can take 10 s+ to answer the first requests after idle (token refresh ~2–3 s, then every REST call waiting on fresh database connections), and almost every open hits that. So a returning web visitor never waits for it to see their screens: `utils/feedSnapshot.ts` keeps the first two feed months (12 h), and `lib/querySnapshot.ts` keeps the small per-viewer reads under `SNAPSHOT_PREFIXES` (own profile, points, badges, cheers, trophies, settings, ad-free, ads, tags, chat list, your clubs' tournament list (newest 40 rows, so Tournaments doesn't shift when it lands, #288), and the public outside leagues and tournaments; 7 days) in localStorage. Both seed the query cache before the first render as stale entries, so their readers show them and refetch at once. `SessionProvider` sets the saved viewer from storage (`readStoredSession` in `lib/supabase.ts`) right after mount instead of waiting for `getSession()`'s token refresh; getSession then confirms or signs out. A snapshot is only shown to the viewer it was saved for (`useCacheUserScope` drops it otherwise) and is deleted when the viewer changes. A new read that a returning viewer sees on a first screen and that is keyed per user can join by adding its prefix to `SNAPSHOT_PREFIXES`; never add anything another viewer must not see on a shared device beyond what the profile already shows. First visits (no snapshot) start the feed request from the page itself (#184): `app/+html.tsx` inlines `utils/feedPrefetchScript.ts`, which on `/` posts `rpc/get_feed_span` for the first screen's span (`utils/feedFirstSpan.ts`, the same pure function the tests check against the app's) with the stored token if it is valid for another minute, else the anon key, and leaves the promise on `window.__vteamPrefetch.feed`; `useMonthEvents` adopts it once when span and viewer match and it is under 15 s old (`lib/feedPrefetch.web.ts`). `feed_first_paint` records where the first rows came from. Count what a first visit sends with `node scripts/shots/request-count.mjs --dist dist-mock --list` (#224: Profile 14 reads, Events 14; tabs mount only when opened). Measure with `node scripts/shots/cold-open-flow.mjs --dist dist-mock --delay 8000` (mocked export, expired token, every Supabase response delayed): Events, Profile, Chat and Tournaments should paint in under a second. Native doesn't keep snapshots yet (AsyncStorage is async).

### Startup config from the CDN (#216)
The update check (`app_config`) and the feed's ads (`ad_banners`, `sponsored_events`) are read once per open through `useStartupConfig(part)` (`lib/startupConfig.ts`): `version` (`useMinVersion`, every screen: `app_config` only) and `ads` (`useFeedAds`, only while the feed shows ads; cache key `ads/feed`, snapshotted with the `ads` prefix). Keep them separate: a screen without ads must not read the ad tables (the startup budget counts reads). On the CDN arm one `/api/startup` request serves both. `GET /api/startup` (`api/startup.ts`, Edge, anon reads, `s-maxage=60, stale-while-revalidate=86400`) serves the same rows from Vercel's CDN, so a cold database only has to answer the feed. It is an experiment: each page load flips a coin between the `cdn` arm (1.5 s timeout, any failure falls back) and the `direct` arm (Supabase), and `startup_timing` {arm, source: cdn | direct | fallback, part, ms} records it (force one with localStorage `vteam.startupArm`). The CDN copy can be a day old, so `feedAdsFrom` (`utils/startupConfig.ts`) re-checks `is_active` and windows on the client. The shots mock answers `/api/startup` with 404, so both arms read Supabase there. Keep or revert by comparing the arms:
```sql
select props->>'arm' as arm, props->>'source' as source, count(*),
       percentile_cont(0.5) within group (order by (props->>'ms')::int) as p50,
       percentile_cont(0.9) within group (order by (props->>'ms')::int) as p90
from app_events where name = 'startup_timing' and created_at > now() - interval '14 days' group by 1, 2;
```

### Scroll position on web
Coming back to a screen on web used to land at the top: the browser's back (and the iPhone swipe-back, which is the same thing) remounts the tab screens, display:none on a hidden screen zeroes its scrollTop, and leaving document-scroll mode scrolls the window to 0. `DocScrollView` takes a `memoryKey` (`'tab:profile:<section>'`, `'tab:clubs'`) and the Events feed uses `useDocScrollMemory('tab:events', ...)`: the offset is kept in a module-level map (`utils/scrollMemory.ts`, cleared on sign-out) and restored when the screen mounts or is shown again. Coming back with a remembered offset, the content stays hidden (`visibility`) until the offset is restored (at most 400 ms), so it never paints at the top and then jumps; the browser's own scroll restoration is off (`history.scrollRestoration = 'manual'`, set in `app/+html.tsx` before the app loads), since it jumped first and the app's restore moved it again. Give a new long tab screen a key; `e2e/scrollRestore.spec.ts` covers Profile.

### Sentry
Import `Sentry` from `lib/sentry`, never `@sentry/react-native` directly. On web, `lib/sentry.web.ts` loads the SDK in its own chunk after first paint and queues calls until then; `components/SentryErrorBoundary.web.tsx` is the matching boundary. Native uses `lib/sentry.ts` unchanged.

### Bundle size (web)
Import icons per family (`import Ionicons from '@expo/vector-icons/Ionicons'`), never from the `@expo/vector-icons` barrel: that pulls every icon set's glyph map into the main bundle.
Reanimated, Gesture Handler (+ hammerjs) and react-virtuoso stay out of the web first load (#193): on web they are imported only from code loaded through `lazyChunk` (`components/LazyChunk.tsx`), today the event screen (`components/event/EventDetailRoute.web.tsx`, preloaded when the browser is idle) and the chat message list (`ChatMessageList.web.tsx`). Elsewhere use core `Animated` or CSS keyframes on web (`components/profile/LegendRing.web.tsx`); the app root on web is a plain View (`components/GestureRoot.web.tsx`), so a lazy screen that uses gestures wraps itself in `GestureHandlerRootView`. Only one lazy chunk may import them: Metro moves modules two lazy chunks share into `__common`, which `index.html` loads up front. CI's `scripts/entry-deps.mjs` fails when any of them reaches the first-load scripts (`--report` lists the biggest packages).

### Gesture layering
(Applies while `SWIPE_NAVIGATION.tabs` is on; the layering is kept for when it is.) The `Pager` uses `onMoveShouldSetPanResponder` (bubble phase) to claim tab swipes. Inner components (WeekStrip, Calendar wrapper) also use bubble phase — since they're more inner, their handlers fire first and absorb the gesture before it reaches Pager. Do not use capture phase (`onMoveShouldSetPanResponderCapture`) for inner gesture handlers; that breaks the layering.

### Guest browsing
Nobody has to sign in to look around. Guests see Events, Clubs, event pages, club pages and other players' profiles; the Chat and Profile tabs render `SignInPrompt`, and the Events/Clubs headers show `SignInButton` (top right) instead of the bell / Create.
- Read the user with `useSession()` (`userId`, `isGuest`), never `supabase.auth.getUser()` — that is a network call to the Auth server every time. Outside React, use `getSessionUser()` from `lib/sessionUser`.
- Actions that need an account call `const requireSignIn = useRequireSignIn()` and `if (!requireSignIn()) return` — guests go to login and come back to the same page.
- **Join finishes after sign-up** (#229): a guest's Join / Join waitlist / Request saves the intent (`setPendingAction` in `utils/pendingAction.ts`: memory + sessionStorage, 30 min, cleared on sign-out) and opens **register**, where `JoinContextCard` shows the game and a New here / I have an account switch. Back on the event signed in, `takePendingAction` hands it over once and `JoinIntentSheet` offers the same signup the footer would (`shouldOfferJoin`, built on `resolveJoinAction`), never joining without the tap; a new player is then offered setup there, and `usePlayerSetupGate` doesn't push `/welcome` over the game during this flow. Metrics: `join_intent_saved`, `join_intent_resumed` (`outcome`).
- Account-only routes are listed in `utils/authGate.ts` (`isProtectedPath`); the root layout bounces guests on those to login. Add new account-only routes there.
- RLS: anything a guest screen reads must have a SELECT policy for `anon` (events, attendees, profiles, clubs, tags already do).

### Sessions from other Austin venues (Schelagg)
`external_sessions` holds sessions other venues and groups run (Volleyworld, ACES, ATX Beach, Reclub meets...). They come from Schelagg ("schedule aggregator", `bryanw121/schelagg`), a separate project that scrapes schedules for any sport and region.

**Schelagg is independent of this database, and must stay that way.** It has no credentials here and never writes here; vteam imports none of its code. Schelagg publishes a public feed (`https://bryanw121.github.io/schelagg/data/occurrences.json`: dated occurrences for every sport and region, sport-specific fields under `attributes`), and vteam pulls it: the `ingest-schelagg-feed` pg_cron job runs `public.ingest_schelagg_feed()` hourly at :25. That function (migration `20261025193000_ingest_schelagg_feed.sql`, uses the `http` extension, fixed URL, no client EXECUTE) keeps only `sport = volleyball`, `region = austin`, upserts rows, and deletes upcoming rows no longer in the feed (cancellations). It skips a feed older than 12h and never deletes when the feed has no matching rows. Change the mapping there, not in Schelagg.

vteam only reads the table (anon SELECT policy). `useMonthEvents` fetches it with events/tournaments, skipping rows not refreshed within `EXTERNAL_SESSION_MAX_AGE_MS` (a stopped ingest shows nothing rather than possibly-cancelled sessions), and `utils/feedItems.ts` normalizes rows into `EventWithDetails` with `_external` set; the feed renders those with `ExternalSessionCard`, which links out to the venue's sign-up (no RSVP). They show only for the viewer's region (`external_sessions.region`, matched against the home city in `user_settings` via `useFeedRegion()`; guests and people without a city get `DEFAULT_FEED_REGION`, Austin, while we pilot there), under All and the type/surface filters. There is no Mine chip: games a player is going to or hosting are in the "You're going" rail, whose See all expands it in place.

**Staleness.** Two guards beyond the max-age cutoff. A session Schelagg hasn't confirmed at its source lately (`verified_at`; Schelagg keeps a failing source's last good copy) gets a note on its card and, for scraped sources a week old, is left out of the feed (`sessionConfirmation` in `utils/externalFreshness.ts`, thresholds in `EXTERNAL_SESSION_CONFIRM_DAYS`; hand-checked `manual` sessions get three weeks and are never hidden for age). And `.github/workflows/feed-freshness.yml` runs `scripts/feed-freshness.mjs` every 6 hours: it reads the newest `updated_at` of `external_sessions` and `external_programs` on live (anon key, read-only) and fails when an import has missed about three runs, so a stopped import emails the owner instead of only emptying the schedule.

### Leagues and tournaments run elsewhere (Schelagg programs)
**Tenet: everything vteam shows about volleyball happening outside vteam comes from Schelagg's public feeds, never from vteam scraping or calling organizers' sites.** `external_sessions` and `external_programs` are mirrors of those feeds, rebuilt by the imports: never edit their rows or add data to them from anywhere else, so a mirror never disagrees with its feed for longer than one import. Sessions come from `occurrences.json` (above); leagues and tournaments from `https://bryanw121.github.io/schelagg/data/programs.json`, which Schelagg rebuilds twice a day from each organizer's sign-up page (ACES, Austin Sports & Social Club, Meanwhile, NAGVA's Texas tournaments, Reclub, the Texas Asian Olympics). The `ingest-schelagg-programs` pg_cron job (every two hours at :40) runs `public.ingest_schelagg_programs()` (migration `20261109120000_external_programs.sql`, same safety as the session ingest: fixed URL, no client EXECUTE, skips a feed older than 18h, never deletes on an empty feed, https links only) into `external_programs` (anon SELECT; rows not in the feed are deleted, and Schelagg drops a row once its deadline or last day passes). `useExternalPrograms()` reads it once (`STALE.programs`, rows not checked within `EXTERNAL_PROGRAM_MAX_AGE_MS` left out) and groups it for the viewer's region with `programsForRegion` (`utils/externalPrograms.ts`, pure, with the card copy helpers): region tournaments, region leagues, and tournaments elsewhere in the region's state (NAGVA, the Texas Asian Olympics). Outside tournaments join the Events feed on their first day (`normalizeProgramTournaments`, `_program`, tagged Tournament, within loaded months), rendered by `ExternalProgramCard` (links out to the organizer, no RSVP; hide menu offers the item or everything from that organizer). `/tournaments` lists them under "Around <city>" and "Elsewhere in the state" (NAGVA, Asian Olympics; guests see these), each card with a date block spanning every day it is on (`programDateBadge`) and how soon it is (`programRelative`); they render without waiting for the club tournament list, which loads inline above them (from the device for a returning member; on a first visit two placeholder rows the same height as real ones hold its space); `/leagues` (`routes.leagues()`, public, linked from the feed under All and Tournament) lists leagues by deadline. Both filter by host (`ProgramHostChips`, `programHosts` / `byHost`) when more than one organizer is listed. New outside data means a new Schelagg feed or field and an ingest change here, not a new fetch in the app.

### Live scores from the Google Sheet tournament app
Some outside tournaments (first: the Texas Asian Olympics, Nov 14–15 2026) run their day on the Google Sheet tournament app (`moonflour/volleyball-tournament`, Apps Script), whose web app serves its whole state as public read-only JSON at `<exec URL>?format=json` (CORS open). `LIVE_SCORE_SHEETS` (`constants/liveScores.ts`) maps a Schelagg program id to that `/exec` URL (in the code, so web and native builds get it; it is public anyway, since browsers call it and the PIN guards writes; an `EXPO_PUBLIC_*` env var overrides it for testing. The Sheet is patched with Manage deployments → New version, which keeps the URL; a new deployment means a release here); for those programs `ExternalProgramCard` adds a **Scores & brackets** strip (`LiveScoresLink`) under the card, which still links out to the organizer as before. `/scores/<program id>` (`routes.programScores(id, { view, division })`, public) reads it with `useSheetScores` (refetches every 10 s, or the Sheet's `refresh_seconds`, while open and in front) and draws Live (courts in play, up next), Pools (`StandingsTable`), Brackets (`BracketView`, per division) and Teams (`SheetTeamsView`: search, and a team's page with its stats and every game; any team name on the screen opens it via `onPressTeam`, `?view=teams&team=`) through the pure mappers in `utils/sheetScores.ts` (team names are the ids; round names match the Sheet app's). **Scorekeeping** (`/scores/<program id>/keep`, `routes.programScorekeeper`, from "I'm a scorekeeper" at the bottom of the scores page) writes to the Sheet through its `doPost` (`callSheet` in `lib/sheetScorekeeper.ts`: text/plain JSON, so no CORS preflight; only `startMatch`, `submitScore`, `cancelMatch`, `checkPin`, each checking the scorekeeper PIN in the Sheet). PIN and name are kept per tournament in memory and the tab's sessionStorage, never in Supabase. `SheetScoringPanel` scores point by point with the Sheet's own rules (`utils/sheetScoring.ts`: targets, deciding set, cap, when a match is decided), saves about every 0.7 s with the version it started from, and shows Use theirs / Keep mine when another phone saved first. Test against the Sheet's dev server (`node dev/server.js --pin=482913`, which answers POST /exec). This is an exception to the Schelagg tenet above, for a feed the tournament desk publishes rather than an organizer's page: the next step is a `live_url` on Schelagg's programs feed, ingested into `external_programs`, so new tournaments need no release.

### Search
The Events header's search button opens `/search` (`app/(app)/search.tsx`, public; `routes.search({ q, scope })`, both in the URL). `useSearch` waits 250 ms after typing, needs 2+ characters, and calls `search_feed(q, scope, region)` (migration `20261113150000_search_feed.sql`): SECURITY INVOKER, so RLS decides what a guest sees. It returns ranked event ids (the hook loads the cards with `EVENT_CARD_LIST_SELECT`), fresh upcoming outside sessions for the region, hosts with upcoming games (public columns only, never a player directory) and clubs; `scope=mine_past` is the viewer's own attended games of the last year. Matching is `search_score()`: a substring, else pg_trgm `word_similarity` (typos). Recent searches (8) live on the device per account (`useRecentSearches`) and are deleted on sign-out. Metric: `search_submitted` (length, scope, result count; never the text).

### Location and private settings
`user_settings` (owner-only RLS) holds per-user settings that don't belong on the public `profiles` row: `home_city_id` (→ `major_cities`, set from the profile editor), `seen_banners`, `reminder_lead_minutes` and `notification_prefs`. Read and write it with `useUserSettings()` (`notification_prefs` goes through `useMyProfile`, which takes it from `useUserSettings`' query, so the row is read once); it is cache-scoped to the user (`settings` prefix in `useCacheUserScope`).

### Hiding things from the feed
A signed-in player can hide feed items from the ⋯ button on a card (`FeedItemShell` in `components/events/FeedHiding.tsx`, laid over the card as a sibling so the card stays one tap target; cards leave room with `menuInset`). The menu (`HideFeedSheet`) offers this item, its venue (outside sessions) or host (vteam events, not your own), and its types (event-type tags and surface). Entries live in `user_settings.hidden_feed` (jsonb array of `{kind, key, label, until?}`, owner-only like the rest of the row), read through `useUserSettings` and changed with `useHiddenFeed` (whole list written, optimistic, Undo restores the previous list). Matching is pure in `utils/hiddenFeed.ts`. The feed screen drops hidden items while building its day sections and shows "N hidden · Show" under each day (each month on desktop) so nothing disappears silently; shown hidden items are dimmed with Unhide. Events the player is going to, waitlisted for or hosting always show, promoted sponsored slots have no menu, and calendar dots skip hidden items. Settings → Hidden in feed (`settings/hidden.tsx`) lists and unhides them. Guests are asked to sign in.

### One-time banners
For information someone needs once, the first time they open a screen (e.g. "we're piloting in Austin"): add an entry to `BANNERS` in `constants/banners.ts` and render `<OneTimeBanner banner={BANNERS.x} />` where it should appear. It shows on the first visit and is recorded as seen immediately (on the device, and in `user_settings.seen_banners` when signed in), so it never returns even if not dismissed. To show an updated message to everyone again, change the entry's `id`. Don't use it for anything a person must act on.

### Guided tours
A tour is an ordered list of steps in `TOURS` (`constants/tours.ts`): target id, title, a short plain body (at most three short sentences, 140 characters), optional `tab` (the tour switches there first) and `placement`. Mark what a step points at with `<TourTarget id={TOUR_TARGETS.x}>` (`components/tour/TourTarget`) or `useTourTarget(id)` on an existing view; register the same id on every surface that shows it (mobile tab bar and desktop sidebar). A step whose target isn't on screen is skipped, which is always a bug: it's recorded (`tour_step_missing` + a Sentry message). So a screen that can hide a target (the week strip under the Tournament filter) keeps it on screen while `useTourWants(id)` is true (`contexts/tour.tsx`: the tour is pointing at or waiting for that target). `e2e/tour.guest.spec.ts` walks the intro with default filters and with Tournament on (from a link and saved); give a new step a filter state there if its screen can hide its target. `TourProvider` (in `app/(app)/_layout.tsx`) draws the overlay as an absolute layer (no Modal); the tabs layout hands it tab switching via `useTourShell`. Start one with `useTour().start('intro', source)`. A banner can start one through its `action` (`{ type: 'startTour', tourId }`). Finishing records `tour-<id>-done` next to seen banners; tours can always be restarted ("Take the tour" on Profile). Tours work on stack screens too: a step without `tab` just waits for its target, so the `scorekeeper` tour lives on the live match screen (opens by itself the first time a set is in play, recorded as `tour-scorekeeper-offered` on the device; its ? button replays it).

### Usage metrics
`track(name, props)` from `lib/analytics` records a small event (names in `ANALYTICS_EVENTS`, `constants/analytics.ts`; flat props only, at most about 1 KB). Events are buffered and sent to `app_events` in one insert every 10s, or when the app goes to the background or the page is hidden. It never throws, drops a batch the server rejects, and turns itself off if the table is missing. It is off under Jest and in automated browsers (`navigator.webdriver`) unless localStorage `vteam.analytics = 'on'`, which `e2e/metrics.spec.ts` sets before intercepting the insert. `app_events` is insert-only for clients: there is no SELECT policy, and `user_id` comes from the `auth.uid()` default. pg_cron (`prune-app-events`, 03:17 UTC) first runs `rollup_app_events()`, which writes the last 7 completed UTC days into `app_events_daily` (one row per day, event name and platform: `events`, and `people` = distinct user or device that day, so don't sum it across days), then deletes rows older than 180 days. So per-event detail (props, funnels) lasts 180 days and daily totals last forever; for all-time counts read `app_events_daily`. **Sessions and online now** (#232): `startUsageTracking(userId)` (root layout) opens a session (random id, in memory) on launch, after 30 minutes hidden or in the background, and when the signed-in account changes (`setUsageUser`); every event carries `session_id` and `app_version`. While the app is visible it calls `app_heartbeat(session, device, platform, version, screen)` once a minute (SECURITY DEFINER, the only writer of `app_sessions`: user from `auth.uid()`, only the device that opened a session can update it, at most one heartbeat per 30 s). `noteScreen` records `screen_view` with the screen type: `screenPattern(segments)` (`/event/[id]`, never an id) for routes, the tab's path in the pager (tabs layout). pg_cron `sample-app-online` (every minute) writes how many people were online (seen in the last 90 s) to `app_online_samples` (30 days); `prune-app-online` (09:23 UTC) rolls up each America/Chicago day's peak and average into `app_online_daily` (forever) and prunes samples and 180-day-old sessions. None of these tables is readable by clients; admin functions read them (Metrics screens). **Admin metrics** (part 2): Profile → Admin metrics (`settings/metrics`, `routes.metrics(tab?)`, `routes.metricsPerson(id)`; the row shows when `useIsAdmin()`, which is cosmetic) reads only the SECURITY DEFINER `admin_metrics_overview(from, to)`, `admin_online_now()`, `admin_retention(weeks)`, `admin_users(search, sort, limit, offset)` and `admin_user_activity(user)` (migration `20261111120000_admin_metrics.sql`; America/Chicago days; screen types, never ids), each raising 42501 unless `current_user_is_admin()`. Overview's action counts (RSVPs, events hosted, messages, kudos, friend requests, clubs joined) leave out accounts in `metrics_excluded_users` (service-only; seeded with the e2e accounts, which once ran against live): add a test account there with one insert in the SQL editor. `e2e/rls.spec.ts` checks that a non-admin and a guest get nothing. Hooks are in `hooks/useAdminMetrics.ts` (cache prefix `admin`: user-scoped, never snapshotted), pure helpers in `utils/metrics.ts`; Live refetches every 15 s while open. The shots mock makes the fixture viewer an admin (`scripts/shots/fixtures/metrics.mjs`). **More events** (part 3): `outside_link_opened` {kind: session | league | tournament | court, org} (outside session cards via `useOutsideSessionLink`, `ExternalProgramCard`, Book a court), `share_tapped` {surface, method} (event header), `feed_filter_changed` {filter, surface} (Events feed chips; not the restore on open) and `scorekeeper_match` {stage: started | finished, sets} (`createMatch`, and the first time a match ends in `useScoreMatch`; never the example). Props are kinds and organizer names, never ids or URLs. `admin_metrics_events(from, to)` (migration `20261111150000_admin_metrics_events.sql`, same admin check) counts them with the guest → signed in → RSVPed funnel for Overview. There is no opt-out: creating an account accepts it, and the Privacy Policy says so. Also instrumented: one-time banners (shown / action / dismissed) and tours (started / step viewed / completed / skipped). Read counts in the SQL editor (or with the Supabase MCP `execute_sql`):
```sql
-- Daily counts per event, last 30 days
select date_trunc('day', created_at)::date as day, name, count(*) as events,
       count(distinct coalesce(user_id::text, anon_id)) as people
from app_events where created_at > now() - interval '30 days'
group by 1, 2 order by 1 desc, 2;

-- Tour funnel: how many saw each step, and where people skipped
select (props->>'step')::int as step, props->>'target' as target,
       count(*) filter (where name = 'tour_step_viewed') as viewed,
       count(*) filter (where name = 'tour_skipped') as skipped_here
from app_events where props->>'tour' = 'intro' and name in ('tour_step_viewed', 'tour_skipped')
group by 1, 2 order by 1;

-- Online now, and today's peak
select count(distinct coalesce(user_id::text, anon_id)) as online_now from app_sessions where last_seen > now() - interval '90 seconds';
select max(online) as peak_today from app_online_samples where at > date_trunc('day', now() at time zone 'America/Chicago') at time zone 'America/Chicago';

-- All-time totals per event (survive the 180-day prune; today isn't rolled up yet)
select name, sum(events) as events, min(day) as since from app_events_daily group by 1 order by 2 desc;

-- Started vs completed vs skipped, per source
select props->>'source' as source, count(*) as started from app_events where name = 'tour_started' group by 1;
select name, count(*) from app_events where name in ('tour_completed', 'tour_skipped') group by 1;
```

### Job health
The background work players notice when it breaks (points, event reminders, the Schelagg imports, the nightly prune, push webhook calls) runs inside the database on timers, and a failure shows nowhere in the app. `public.job_health()` (SECURITY DEFINER, executable by anon, aggregates only: no error text, ids or user data) reports every pg_cron job's last successful run and failures in 24h, the newest Schelagg rows, attendees `award_event_points()` should have paid over an hour ago and didn't, and failed `net._http_response` calls. `scripts/job-health.mjs` judges the rows against `EXPECTATIONS` (per job: how long it may go without a success) and `.github/workflows/job-health.yml` runs it on live and beta every 3 hours, so a failure emails the owner with a table in the job summary (feeds are shown only: `feed-freshness.yml` already pages for them). **A new cron job needs an entry in `EXPECTATIONS`**: CI's Web build runs the script on beta with `--expectations-only` and fails until it has one. **Server headroom** (#290): `.github/workflows/server-health.yml` runs `scripts/server-health.mjs` on live every 30 minutes. It probes the REST API with the anon key (twice, 60 s apart, before failing) and, with the repository secret `SUPABASE_METRICS_KEY` (a dedicated Supabase Secret API key, metrics only; without it this part is skipped with a notice), reads Supabase's Metrics API and judges memory commitment (Committed_AS / CommitLimit: warn 80%, fail 90%; past 100% the server stops starting connections and cron workers, which froze live on 2026-11-12), available RAM, swap, the `/data` disk and connections against `HEADROOM`. A missing metric fails the run. A warning also fails it (the email is the only alert): above 80% commitment for long, move up a compute size. Each run keeps `headroom.json` as an artifact (90 days).

Read the error message of a failing job:
```sql
select jobname, status, return_message, start_time
from cron.job_run_details join cron.job using (jobid)
order by start_time desc limit 20;
```

### Messages: toasts, not alerts
`Alert.alert` does nothing in react-native-web, and most players are on the web. Tell someone something with `toast` from `lib/toast` (#228): `toast.show({ title?, message, variant: 'error' | 'warning' | 'success' | 'info', action?: { label, onPress } })`, or `toast.error("Couldn't join", e, retryAction?)` for a failed write (it says "Check your connection" for network errors and `GENERIC_ERROR_MESSAGE` otherwise, never a raw database message). It is module-level like `lib/query`, so hooks and mutation handlers call it directly; `ToastHost` (in `app/(app)/_layout.tsx` and `app/(auth)/_layout.tsx`) draws one toast at a time (a new one replaces it), with theme colours (`toast*Bg` tokens), role alert and a dismiss button. `notifyInfo` / `notifyError` (`utils/notify`) are thin wrappers over it. A choice still goes through `confirmDestructive` / `ConfirmDialog`. `__tests__/noSilentAlerts.test.ts` fails when a new file imports `Alert`; its `NOT_YET_CONVERTED` list only shrinks.

### Terms and Privacy
The policy text lives in `constants/legal.ts` (Markdown subset, rendered by `components/legal/LegalDocument` via `utils/legalMarkdown.ts`) and is served at the public root routes `/terms` and `/privacy` (`app/terms.tsx`, `app/privacy.tsx`, outside both route groups so guests and store reviewers can open them and the sign-up form stays mounted underneath). `AgreementLine` (passive clickwrap) sits under every sign-up / sign-in action on register and login. Placeholders written as `\[...\]` render highlighted until they're filled in. Bump `TERMS_VERSION` when the Terms change materially.

### Text size
Every font size is a token in `theme.font` (`size`, `heading`, `emoji`, `watermark`; nothing below 11px), and every `Text` / `TextInput` is imported from `components/ui/Text`, never from `react-native` (`__tests__/textSizeFloor.test.ts` enforces both). That wrapper multiplies the style's own `fontSize` and `lineHeight` by the text size setting (Settings → Display: Small 0.9×, Default, Large 1.15×, Extra large 1.3×; `TextScaleProvider` in `contexts/textScale.tsx`, stored on the device) and the OS/browser text size: on native React Native applies Dynamic Type itself and the wrapper caps it through `maxFontSizeMultiplier`; on web, where react-native-web emits fixed px, it reads the root font size. `maxFontSizeMultiplier` on the wrapper caps the combined scale (default `MAX_TEXT_SCALE`, 2×); pass `TIGHT_TEXT_SCALE` (1.3×) for fixed-size UI (tab bar labels, unread pips) and `COMPACT_TEXT_SCALE` (1.15×) for rows of equal cells on a 320px phone (week strip dates, event tabs). Non-`Text` sizes (SVG labels) use `useScaledFontSize(token)`. Check new layouts at Extra large.

### Friends
Mutual friendships (#15). `friend_requests` holds requests (only the two people see a *pending* one; a decline is never shown to the sender) and `friendships` holds one row per direction, so each person reads only their own rows and `is_best_friend` (at most 10) stays private to its owner. Guests get no access. Clients never write these tables: every change goes through the SECURITY DEFINER RPCs `send_friend_request` (30 a day, 3 a week to the same person, refused if they silenced you; asking back accepts), `respond_friend_request`, `cancel_friend_request`, `remove_friend`, `set_best_friend`. They notify with `friend_request` / `friend_accepted`. Read and act with `useFriends()` / `useFriendActions()` (`hooks/useFriends`, cache prefix `friends`, user-scoped); `utils/friends` derives status, sorting and copy. UI: `FriendButton` on other players' profiles, Settings → Friends (`routes.settings('friends')`), and "Ana and 2 friends going" (`FriendsGoingLine`) on event cards (`useFriendsGoing(eventIds)`: one `get_friends_going` call for the loaded feed, skipped for guests and people with no friends) and event detail (derived from the loaded attendees).

### Club polls
Club owners post polls from a club's Updates (**New poll**, `PollComposerSheet`): a question, **Dates & times** or **Text** options (2–10), "members can pick more than one", a close time (default 2 days) and Notify members. A poll is a `club_posts` row plus `club_polls` / `club_poll_options` / `club_poll_votes` (migration `20261113180000_club_polls.sql`): members read all three (who picked what is visible to members), and nobody writes them directly: `create_club_poll` (owners; notifies members with `club_poll`), `vote_club_poll` (members, while open; replaces the caller's picks) and `link_poll_event`. The feed embeds the poll on its post (`CLUB_POST_FEED_SELECT`), `PollBlock` draws it inside `ClubPostCard`, votes are optimistic (`useClubPollActions`), and tallies are pure (`utils/clubPoll.ts`). Closing is a timestamp, no cron. When a time poll closes, owners get **Create event for <time>** (each tied winner), which opens `routes.host({ clubId, date, title, pollId })`; saving links the event to the poll and the card shows **Game posted →**.

### Host form (create / edit an event)
`app/(app)/host.tsx` only composes (#188): `useHostForm` (`hooks/host/`: the form, Repeat, picked tags and club, and edit loading, seeded from the cached detail row and never overwriting what the host typed), `useHostContext` (tags, owned clubs, recent venues, templates), `useHostBringList` (What to bring) and `useSaveEvent`; the pure rules are in `utils/hostForm.ts` (`formFromParams` for Book a court and club poll prefill, `formFromEvent`, `eventDates`, `eventColumns`) and each card is a `components/host/*Section` (props in `types/host.ts`, styles `shared.host*`). A save is ONE call, `save_event(p_edit_id, p_event, p_dates, p_tag_ids)` (migration `20261113200000_save_event.sql`, SECURITY INVOKER so RLS applies, `authenticated` only): a create writes one row per date (1–52) and their tags; an edit writes the row, diffs tags and promotes the oldest waitlisted players into any new spots under the same per-event lock joins take (`enforce_event_capacity`), so `notify_on_waitlist_promoted` fires as before. Either everything saves or nothing does, so the result is `saved` or `failed`. What to bring, the club poll link and Save as template run after it and report their own failures without undoing the game.

### Reports (moderation)
"Report player" on another player's profile and in a DM's header menu (and from the bad-word prompt) opens `ReportSheet` (`components/ReportSheet.tsx`): a reason (`REPORT_REASONS`, `constants/reports.ts`), optional details (1000 chars) and, where it makes sense, "Also silence <name>" (on by default in DMs). It calls `report_user(target, kind, context_id, reason, details)` (`hooks/useReportUser.ts`, metric `report_sent` with kind and reason only), which writes `user_reports` (#243): signed-in only, never yourself, 10 a day (`check_rate_limit`), one open report per reporter + person + context, and a copy of the reported message / comment / post text when the reporter can see it, so deleting it later keeps the evidence. Clients have no access to `user_reports` at all. Admins see them in Profile → Admin metrics → **Reports** (`settings/metrics?tab=reports`, `ReportsPanel`): open ones oldest first with "due in N h" against the 24-hour review target (`REPORT_REVIEW_HOURS`), the snapshot, and **Dismiss / Warn / Suspend** through `admin_resolve_report` (both admin functions raise 42501 for anyone else). Warn sends the reported player a `moderation_warning` notification; Warn and Suspend send the reporter a `report_resolved` one (no names either way). Suspend only records the decision for now: act by hand until account suspension exists. Still to come: Report on a single message, comment or post (the kinds are already allowed), and an email to the feedback address on each new report (needs a live Database Webhook like `send_notification_push`).

### Account deletion
Settings → Account → Delete account (`settings/delete-account.tsx`) shows `get_account_deletion_preview()`: every club, tournament and upcoming event the person owns and whether it will be handed over (and to whom) or deleted / cancelled (a deleted club's chat, posts and tournaments are spelled out), plus a hash of that plan. If the last sign-in is older than 10 minutes (the JWT `amr` timestamp) the screen asks for the password or an emailed code first. After they type DELETE, the `delete-account` edge function re-checks the recent sign-in and calls `delete_account(user, planHash)`: ONE transaction that locks the profile row, recomputes the plan, refuses with `plan_changed` if it differs from what was shown, carries it out, clears every NO ACTION reference (it raises rather than leave one), and deletes from `auth.users` last. Files (avatar, chat photos, deleted clubs' avatars) are removed only after it commits. Rules: clubs the person created or solely owns → the earliest other club **owner** not also being deleted, else deleted (with chat, posts and tournaments); tournaments → an owner of their club, else deleted; upcoming events → earliest co-host, else cancelled (attendees notified); past events stay with `created_by = null`; kudos they gave stay with `giver_id = null`; tournament captaincy → next team member. **A new foreign key to `profiles` / `auth.users` must be ON DELETE CASCADE or SET NULL, or be handled in `delete_account`.** The public `/delete-account` page (for Google Play) explains in-app and email deletion.

### Badge artwork
`constants/badgeArtwork.ts` maps every badge tier to a bundled PNG under `assets/badges/`. `BadgeIcon` uses the earned tier, or dimmed tier 1 for a locked preview; a generated `badge_art` row (below) takes precedence for an earned tier; remote definition URLs and gradient icons remain fallbacks for future catalog entries. Keep the artwork map complete when adding tiers. Vex keeps its original image bytes. Artwork does not change award thresholds or saved display tiers. Run `node scripts/shots/badge-artwork-flow.mjs --dist dist-mock` against the mock web export to verify all 36 files, tier selection, labels and served image bytes at desktop/mobile sizes; CI runs this before axe.

### Generated badge art (#10)
An admin can replace a tier's bundled art with generated art: a `badge_art` row (public URL in the `badges` bucket) wins for an earned tier, read by `useBadgeArt` (`STALE.badgeArt`). Generate with `node scripts/generate-badge-art.mjs <badge> [tier] | --missing` (admin account; calls the `generate-badge-art` edge function, which costs about $0.03 an image: see `supabase/functions/README.md`). The look is defined once, in `supabase/functions/_shared/badgeArt.ts`; never call an image model from the app.

### Notifications, push and reminders
Inbox rows (`notifications`) are written by database triggers and jobs (clients never insert them, except the few event flows RLS allows). Every row is also pushed: a Database Webhook on `notifications` INSERT calls the `send-notification-push` edge function, which honours `user_settings.notification_prefs.push.<type>` (falling back to the legacy `profiles.notification_prefs` when there is no private copy) and sends the row's `data.deep_link` (`chat_mention` is skipped; `send-chat-push` covers chat). Tapping any push opens its deep link through `isAppPath` (`subscribeToPushTaps` in `utils/pushNotifications.ts`, wired in `app/_layout.tsx`). So a new notification type needs only its row, a `deep_link`, and an entry in `NOTIFICATION_TYPES` plus the check constraint. Event reminders come from the `event-reminders` pg_cron job (`send_event_reminders()`, informational only: "<title> at 4:00 PM" / "Starts in 2 hours · <location>"), at `user_settings.reminder_lead_minutes` (Settings → Notifications → Reminders), once per player per event (`event_reminder_log`). Hosts and co-hosts get `late_dropout` when an attending player leaves within 24h. Rows that should fold while unread (one per game for cheers, one per event for edits, #194) set `group_key` and insert with `on conflict (user_id, group_key) where read_at is null and group_key is not null do update` (`group_count`, `last_activity_at`): the push webhook fires on INSERT only, so folding sends no extra push. The inbox orders by `last_activity_at` and collapses older per-cheer rows client-side (`utils/notificationGroups.ts`).

**New game alerts** (#170): pg_cron `new-game-alerts` (every 10 min) runs `send_new_game_alerts()`, which tells club members (`club_members.game_alerts`, the bell on a club page via `set_club_game_alerts`) and players who went to 2+ of a host's games in 180 days about games created 10–70 minutes ago (not cancelled, started or full; never the host, anyone on the roster, or anyone who silenced the host), as `new_game` rows. Players pick sources and "only when it's" filters on Settings → Notifications (`GameAlertsCard`, `user_settings.game_alerts`, parsed by `utils/gameAlerts.ts`; filters match in `game_alert_matches()`, Chicago time, weekday evenings from 5 PM). One alert per player and event (`game_alert_log`, service-only), at most 3 a Chicago day, and several games from one club or host in a run fold into one alert linking to the club or host.

**Web push** (#189): browsers get the same pushes. `public/manifest.webmanifest` (linked in `app/+html.tsx`) makes the site installable, and `public/sw.js` (no caching, no fetch handler) shows each push and, on a tap, focuses an open window and posts `{type: 'vteam-push-tap', deep_link}` (or opens the link). `utils/pushNotifications.web.ts` is the web side of `utils/pushNotifications.ts`: `getWebPushState()` (pure rules in `utils/webPushState.ts`: `needs-install` for iPhone Safari in a tab, since iOS only pushes to a Home Screen app; `ask`, `on`, `blocked`, `unsupported`), `enableWebPush()` (asks for permission **only from a tap**, subscribes with `EXPO_PUBLIC_VAPID_PUBLIC_KEY`, upserts `push_tokens` with `platform 'web'`, the endpoint as `token` and `web_keys {p256dh, auth}`), `disableWebPush()`, `forgetWebPushToken()` (Account → Sign out, before signing out) and `registerPushToken()` (re-saves an existing subscription on sign-in, never asks). Settings → Notifications on web shows `WebPushCard` (install steps, Turn on, the per-type switches once on, or how to unblock) instead of "Push on this phone". `send-notification-push` and `send-chat-push` send web tokens through `_shared/webpush.ts` (VAPID ES256 JWT + aes128gcm, WebCrypto only; a 404/410 deletes the token; skipped with a warning while the VAPID secrets are unset). Metrics: `web_push_state`, `web_push_enabled`, `web_push_blocked`.

### Points
`point_events` is an append-only ledger (one row per change, server-written only: clients have SELECT on their own rows and nothing else); `point_balances` holds each user's total, kept by an AFTER INSERT trigger and readable by everyone (profiles show it via `usePointsBalance`). The CHECK `balance >= 0` makes any overspend fail. `award_event_points()` (pg_cron `award-event-points`, every 15 min, idempotent through unique `(user_id, event_id, reason)` / `(user_id, tournament_id, reason)`) awards attendees still `attending` and not flagged as no-shows once `event_date + duration_minutes + 2 hours` has passed: 5 for an event tagged Tournament, otherwise 2; members of approved teams in a `completed` tournament get 5. The job runs on beta too (harmless: only test accounts there), so the drift check needs no exception. Spending writes a negative row from a SECURITY DEFINER function; never update or delete ledger rows.

**No-shows** (#151): from an event's start until 2 hours after its end, the host or a co-host can flag an attending player from the roster ⋯ menu (**Mark as no-show** / **Undo no-show**; `setNoShow` in `useEventAttendance`, window from `noShowWindow` in `hooks/event/derive.ts`). The flag is `event_attendees.no_show` (+ `no_show_marked_at` / `_by`), written only by `set_no_show()` (SECURITY DEFINER, authenticated; checks host/co-host, not cancelled, target attending, inside the window); the `event_attendees_guard_no_show` trigger rejects any other insert or update of those columns. `award_event_points()` pays event attendance only once end + 2 hours has passed, and never to a flagged player. The row is publicly readable like the rest of `event_attendees`, but the app shows flags only to hosts/co-hosts (badge + note above the roster) and to the flagged player ("Marked as a no-show" card on Details with Message host). Guests (+1s) earn no points and can't be flagged.

### Ads (house banners and sponsored events)
No ad network: two admin-managed tables. `ad_banners` (title, body, https image/link, `is_active`, `starts_at`/`ends_at`) and `sponsored_events` (`event_id` + window). RLS shows everyone only the rows inside their window; writes need `current_user_is_admin()` (checks `app_admins`, or `profiles.is_admin` on a database without that table, for `auth.uid()` server-side). `useFeedAds` reads both; `planFeedAds` (`utils/feedAds.ts`, slots in `FEED_ADS`, `constants/ads.ts`) puts the soonest sponsored event in a promoted slot after the 2nd feed item and a banner after the 5th, then every 10th. Sponsored events also keep their normal place, with `SponsoredLabel`. Every ad surface reads `useAdsEnabled()` and nothing else: guests always see ads; signed-in users see none while an ad-free period bought with points runs (`ad_free_passes`, owner-read only; `get_ad_free_status()` / `redeem_ad_free()`, price in `ad_free_offer()`: 100 points for 30 days, renewing extends from the current expiry; screen: Settings → Go ad-free). The feed screen only asks "is this sponsored?" and "what follows this item?"; keep ad logic out of cards and out of Profile. Admins manage rows in SQL for now:
```sql
insert into ad_banners (title, body, image_url, link_url, ends_at) values ('Title', 'One line', 'https://…/img.jpg', 'https://…', now() + interval '14 days');
insert into sponsored_events (event_id, ends_at) values ('<event id>', now() + interval '7 days');
```


### The URL is the view (shareable links)
Every filter, tab, day and search that changes what a screen shows is in its URL, so a copied or shared link opens the same view: `/?type=tournament&surface=sand&day=2026-11-14`, `/event/<id>?tab=people`, `/tournament/<id>?tab=schedule`, `/tournaments?view=past&host=NAGVA`, `/leagues?host=ACES`, `/clubs?filter=popular&q=sand`, `/book?day=…&surface=sand`, `/profile?edit=1`, `/settings/badges?badge=<type>`, `/settings/feedback?type=bug`, `/settings/history?filter=hosted`, `/settings/metrics?tab=people&range=7&sort=active`, `/login?mode=reset` (or `code`). Param names and parsing live in one place, `VIEW` in `utils/urlViews.ts`, built from the pure codecs in `utils/urlState.ts` (`oneOf`, `text`, `flag`, `tabIndexCodec`, `feedDay`; every value from a link is checked and anything unknown falls back to the default, and defaults stay out of the URL). Screens hold the value with `const [v, setV] = useUrlParam(name, VIEW.screen.name)` (`hooks/useUrlParam.ts`), and `routes.*` builders take the same view (`routes.events({ type })`, `routes.event(id, { tab: 1 })`, `routes.badge(type)`, `routes.feedback('bug')`, `routes.login({ mode: 'reset' })`). Rules: writes replace the history entry (Back leaves the screen, it doesn't undo filters); a link's feed filters show for that visit only (the device's saved filters, `utils/feedFilters`, are used and written to the address when a link has none); tab tabs use words, and the numbers older notifications send (`?tab=3`) still work. **Tab screens** (Events, Clubs, Chat, Profile) stay mounted under other tabs, so they pass `{ tab: 'events' }`: they read and write only while their tab is the one in the address, each tab's last view is kept in `utils/tabViews.ts`, and switching tabs (sidebar, phone tab bar) puts it back. Narrow web keeps the address on the tab that's showing (the tabs layout replaces it on a switch, and back/forward or a link moves the pager); there the pager draws the screens without a route under them, so the hook replaces the tab's whole address instead of `setParams`. Clubs and Chat live in `(main)/` with Events and Profile, so `/clubs` and `/chat` open in the pager on phones. Writes wait for the router to be ready and skip values the address already has (an early navigation is dropped). Never put anything private or typed into a form in the URL: chat search, form text, passwords and codes, the admin People search (names and emails would land in server logs). A link never grants access: account-only pages still go through the sign-in gate (and come back with their query, `returnPath` in `utils/authGate.ts`), and RLS decides what any reader gets. Share buttons (`components/ShareLinkButton.tsx`: native share sheet, the browser's on phones, copy on desktop; `link_shared` metric) are on Tournament, Tournaments, Leagues, the Events header once a filter or day is set, and your own Profile (which shares `/profile/<id>`: `/profile` opens the viewer's own). Event shares carry `?tab=` for People and Discussion only. `e2e/shareableLinks.guest.spec.ts` covers links, chips, phone tabs and sign-in.

### Share links and link previews
Sharing an event always sends an https link to the web app, `shareUrl(routes.event(id))` from `constants/share.ts` (`WEB_ORIGIN`: `EXPO_PUBLIC_WEB_ORIGIN`, else `https://vteamvolleyball.com`; on web with no env, the page's own origin), never `Linking.createURL` (`vteam://` opens nothing for people without the app). The text comes from `eventShareMessage` in `utils/eventShare.ts`, which writes times in `SHARE_TIME_ZONE` (America/Chicago).

On Vercel, `vercel.json` routes `/event/<uuid>` to `api/event-page.ts`, which serves `dist/index.html` with `<title>`, `og:*` and `twitter:*` tags in the head (body untouched, so hydration is unaffected), reading the event with the anon key (`EVENT_PREVIEW_COLUMNS`) and building the copy with `buildEventMeta`. `og:image` is `api/og/event.tsx` (Edge, `@vercel/og`), drawn from `theme` with fonts from `public/og-fonts`; render it locally with `npm run og:render`. Everything `api/` imports from the app (`constants/share`, `constants/selects`, `constants/theme`, `utils/eventShare`, `utils/eventDate`, `utils/price`, `types`) must stay free of React Native / Supabase imports (a unit test checks). `serve.json` in CI has no functions, so previews are covered by `__tests__/eventPage.test.ts`. To preview clubs or tournaments later, generalize `api/event-page.ts`.

### Game recap
A finished game (#227) never shows Join, Leave, +1 or spots left: `RecapFooter` replaces `JoinFooter`. Players who were attending (not no-shows, `recapEligible`) get **Your game** at the top of Details (`YourGameCard`: points by `pointsForEvent`, pending until the 2-hour window passes; cheers received; games this year; `useMyGameRecap`) and **Share your game**: `shareRecap` (`utils/shareRecap(.web).ts`) shares the picture `api/og/recap.tsx` draws (Edge, 1080×1920, `?event=&user=`, anon reads only, 404 unless that player attended a game that has ended; only their own name and numbers) with a link `routes.event(id, { r: true })` (Web Share with the file on phones, download + copied link on desktop, the share sheet on native). Everyone, guests too, sees the host's next game (`useHostNextGame`). Metrics: `recap_shown`, `recap_shared` {target}, `recap_link_opened` (`?r=1`). Pure rules live in `utils/recap.ts`, which `api/` imports, so it stays free of React Native.

### Weather on outdoor games
Sand and grass events with coordinates that start within 7 days show a forecast chip on their feed card (`ForecastChip`, next to the `TimePill`) and an hourly row on the event page (`ForecastRow`, after the location). Data: `api/forecast.ts` (Edge, no secrets) proxies the National Weather Service (`/points` → `forecastHourly`, User-Agent with `NWS_CONTACT`), trims it (`api/_lib/forecast.ts`) and lets the CDN cache it 30 min; non-US points and failures answer 204 and the UI draws nothing. `hooks/useForecast.ts` caches per court (coordinates rounded to 2 decimals, `STALE.forecast`), and `useFeedForecasts` reads the feed rows' missing coordinates in one `events` query (the feed RPC leaves them out), then makes one request per distinct court. Rules (`forecastWindow`, `pickForecastHours`, `heatIndexF`, `forecastSummary`) are pure in `utils/forecast.ts`; thresholds and copy in `constants/weather.ts`. The shots harness answers `/api/forecast` from `scripts/shots/fixtures/forecast.mjs`; e2e (`e2e/weather.spec.ts`) routes it.

### Experimental features and the scorekeeper
Profile → **Experimental features** (`settings/experimental.tsx`) lists one card per entry in `EXPERIMENTS` (`constants/experiments.ts`); add a card there and remove it when the experiment ends. The first is the **Scorekeeper** (`app/(app)/scorekeeper/`): official USAV-style scoring by tapping, with a finished scoresheet. It is device-only (no tables): a match is an event log (`types/scoresheet.ts`) saved on every tap by `lib/scoresheet/storage(.web).ts`, two alternating copies with a save counter so a cut-off write never loses the match, and `useScoreMatch` restores it exactly after the app or tab closes. Everything on screen is derived by `replay()` in `lib/scoresheet/engine.ts` (pure, unit-tested): rotation, servers, service rounds, subs and re-entry, liberos, time-outs (with a countdown that survives closing the app, `lib/scoresheet/timer.ts`), sanctions, out-of-rotation faults by either team (point to the other team) and wrong servers (cancelling points), overrides and set/match ends. Formats can start sets at 4–4, cap per set and run a match clock with "time's up" (`withOptions` in `lib/scoresheet/rules.ts`; NAGVA pool play and bracket are quick setups). The engine never refuses what happened on court: rule breaks are recorded with a warning. Undo/redo and timeline edits are reversible log operations (`lib/scoresheet/history.ts`) saved with the match. The scoresheet screen draws the official form itself (`OfficialSheetView`: the bundled blank form `assets/scoresheet/usav-2-set-scoresheet.png`, rendered from the same PDF at 144 dpi in grayscale (redo it if the PDF changes), with `officialLayout` marks on top as SVG; text measured with `helveticaMeasure` and fitted by `fitText`, shared with the PDF), with Enlarge for phones. **Official USA Volleyball form**: `lib/scoresheet/officialLayout.ts` (pure, unit-tested) places every entry on the real two-set scoresheet (`assets/scoresheet/usav-2-set-scoresheet.pdf`, embedded as base64 in the generated `usavTemplate.ts`: rerun `node scripts/scoresheet-template.mjs` if the PDF changes) and `officialPdf.ts` draws it with pdf-lib (import `pdf-lib/cjs`: the ES build breaks the web bundle). Marks follow the USAV Indoor Scoring Instructions (2025–27): X through S / R, X in box 1 for the receiving team's server I, a check through each served box number, final exit scores circled (an unchecked box when the set ends on a side-out), T-bars over start points and unused points, final point not circled, penalty points slashed and circled, captain in the circle, and when a libero serves a triangle around that position's Roman numeral (first libero serve of the set) and around each point scored on the libero's serve (`TeamSetState.liberoPoints`, S6.2). Any format fits: one set fills the Set 1 block, sets 3+ continue on more copies of the form, overflow goes to Remarks. `OfficialSheetButton` loads it on tap; `deliverPdf(.web).ts` downloads on web and opens the print/share sheet on native (`expo-file-system` + `expo-print`). **Copy to paper** (`[id]/copy.tsx`): `lib/scoresheet/copySteps.ts` (pure, unit-tested) turns the match into steps in the paper form's own order (header, then per set: teams & serve, lineup, subs, running score, service rounds, close; then results, sanctions, remarks, officials), skipping empty parts, each shown on the real form zoomed to that part with what to write already on it (`OfficialSheetView` with `focus` / `highlight`; `focusGroups` in `lib/scoresheet/sheetView.ts` splits areas too far apart to read together); ticks are saved on the match (`MatchDoc.copied`, `setCopied`) so it resumes. The sheet screen's `MatchDetailsCard` edits the header after the match (`updateInfo`). **Live scoresheet** (`LiveSheetPanel`, under the court while a set is played): the form filling in as you score. The score updates first (the panel renders a `useDeferredValue` copy of the match), marks are memoized by a stable key (`opKeys` in `lib/scoresheet/liveSheet.ts`) so a point redraws only its new marks, and nothing is laid out while it's closed (remembered on the device). `diffMarks` (pure, unit-tested) compares the drawn layout with the new one: new marks are tinted, marks an undo erased are outlined dashed (`erased` on `OfficialSheetView`), and a redo tints them again. On phones it "follows the pen" (`followFocus`: zooms to the latest change, readable at phone width); Set and Whole form are one tap away. `lib/scoresheet/teamStore.ts` remembers teams (starting six + bench) and today's competition/court/officials on the device (AsyncStorage) for one-tap setup (`SavedTeamsPicker`). **Example match**: "Open the example" on the Scorekeeper home saves a fresh copy of `exampleMatch()` (`lib/scoresheet/exampleMatch.ts`, id `example`, `MatchDoc.example`: a deterministic best-of-3 built through the real log and engine, unit-tested to record no warnings) and opens its scoresheet, where the `scorekeeperExample` tour walks through the form, Copy to paper, the PDF and "Start your own match" (every time the example opens); it stays out of the saved-matches list and never feeds the carried-over match details. The Hall box is no longer asked for or printed. `scripts/shots/scorekeeper-flow.mjs` walks the whole flow on a mocked export, including closing and reopening the page mid-set.

### Login accepts email or username
If the login field doesn't look like an email, `login.tsx` calls `signInWithUsername` (`lib/usernameAuth.ts`), which invokes the `login-with-username` edge function: it resolves the username to an email server-side (service role; `get_email_by_username` is not executable by clients), signs in, and returns only a session (the app calls `setSession`) or a generic "Incorrect username or password" for an unknown username, a wrong password and any Auth-side failure (Auth's own 429 included: only real usernames reach Auth), padded to a minimum response time. It limits attempts with `check_rate_limit` per 15 minutes: 100 attempts per IP, and 30 failed attempts per username (read before every attempt, counted only on failure, so signing in never uses it up and the shared e2e account isn't locked out by CI), and forwards the caller's IP to Auth (`Sb-Forwarded-For` with the project's secret key; see `supabase/functions/README.md`). Never send an email address back to a signed-out caller. The email-code form treats "no account for this email" like a sent code.

### Rate limiting
Server-side, Postgres-backed (`public.rate_limits`, fixed windows). `check_rate_limit(key, max, window_seconds)` counts a hit and returns whether the key is under its limit (edge functions call it with the service role); `enforce_rate_limit(...)` raises SQLSTATE `PT429`, which PostgREST returns as HTTP 429 "Too many requests". Both are definer/service-role only. Current limits (keep them generous; CI signs `e2ebot` in and posts often):

| Surface | Limit | Where |
| --- | --- | --- |
| Username sign-in | 30 / 15 min per username, 100 / 15 min per IP | `login-with-username` edge function |
| New DM conversation | 30 / hour per user (opening an existing DM is free) | `find_or_create_dm` |
| Member search | 120 / minute per user | `search_members` RPC (`lib/memberSearch.ts`) |
| Messages | 60 / minute per user | trigger on `messages` |
| Event / tournament / club-post comments | 20 / minute per user each | triggers |
| Club posts | 10 / minute per user | trigger |
| Feedback | 5 / hour per user | trigger on `feedback_submissions` |

Add a limit to a new insert path with `create trigger ... before insert ... execute function public.rate_limit_insert('<bucket>', '<max>', '<window seconds>')`. Email sign-in, registration and password reset go straight to Supabase Auth, whose own per-IP limits apply (Dashboard → Authentication → Rate Limits). pg_cron `prune-rate-limits` deletes counters older than a day.

### Private data stays off public rows
Everyone (including signed-out visitors) can read `profiles`, `event_attendees`, `cheers` rows, so private values live elsewhere:
- notification switches: `user_settings.notification_prefs` (owner-only; `useMyProfile` reads and writes it). `profiles.notification_prefs` is legacy and always the default.
- admins: `app_admins` (no client access), checked server-side with `current_user_is_admin()` (or `is_app_admin()`). `profiles.is_admin` is always false.
- a host's reason for denying a join request: `event_attendee_denials` (that attendee, the host and co-hosts; `useMyDenialReason`). `event_attendees.denial_reason` is legacy and always null.
- Triggers move values old app builds still write to the legacy columns. A later contract PR drops those columns.
- +1 guests' names are for signed-in users only; signed-out visitors read the name-free `event_guests_attending` view (`fetchEventGuests`). Signed-out visitors can't see who gave a kudo (`cheers.giver_id`).
- `chat-images` is a private bucket: `messages.image_url` stores the object path (older rows a former public URL), and `useChatImageUrl` signs it. Storage only signs for the uploader or a member of a conversation with a message from that uploader referencing the object (`can_read_chat_image`).

## Code Conventions

- **Functional components only**, explicitly typed `type Props = { ... }`
- **Types live in `types/`**, never inline in components. `types/database.ts` is generated; app-level types are derived from it in `types/index.ts` (or a sibling file there)
- **Shared styles in `constants/styles.ts`** via a single `StyleSheet.create` — reference as `shared.xyz`. Add new shared styles there rather than inline
- **Design tokens in `constants/theme.ts`** (`theme.colors`, `theme.spacing`, `theme.font`, `theme.radius`) — never hardcode colors or font sizes
- **File names**: components PascalCase, hooks/utils camelCase, routes lowercase
- **One hook per concern**, built on `lib/query`: `useSession` for the signed-in user, `useMyProfile`, `useMonthEvents` for the event feed, `hooks/event/*` for event detail. A new read gets a hook (or a `useQuery` in the screen if it is used once); new code never calls `supabase.from()` for reads inside effects (older settings/history, settings/hosted and profile/[id] still do; migrate them when you touch them)
- **Values come from constants**: colors/gradients from `theme` (including `theme.colors.white` / `black`, `medal*`, `theme.gradients.brand`), breakpoints from `BREAKPOINTS`, route strings from `routes.*`, user-facing strings shared by 2+ places from `constants/copy.ts` (`GENERIC_ERROR_MESSAGE`, `NETWORK_ERROR_MESSAGE`, `SKILL_LEVEL_LABELS`)
- **Dates**: always use `cleanDate(date: Date)` from `utils/` to convert to ISO string before inserting into Supabase
- **Keep it simple**: don't abstract until there are at least 3 real use cases. Prefer a few extra lines of clear code over a premature helper

## Environment Variables
Stored in `.env` (not committed):
```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_WEB_ORIGIN=https://vteamvolleyball.com   # optional; where shared links point
EXPO_PUBLIC_VAPID_PUBLIC_KEY=...                       # optional; web push is offered only when set (#189)
```
On Vercel the link-preview functions also read `SUPABASE_URL` / `SUPABASE_ANON_KEY` (server-side copies of the public values; they fall back to the `EXPO_PUBLIC_*` pair). The weather proxy reads `NWS_CONTACT` (a contact email or URL for the National Weather Service User-Agent; optional).

## Running the App
```bash
npx expo start          # opens Expo dev tools
npx expo start --web    # test web experience directly
```

## UI primitives
Use `components/ui` (import from `components/ui`) before hand-rolling UI:
- `ScreenHeader` for page headers and back rows (no hand-built headers)
- `Chip` for pill filters (`solid` or `tint` variant)
- `TimePill` for an event's start time (lavender: `theme.colors.time` background, `timeInk` label); use it wherever a player decides whether to join
- `IconButton` for square icon buttons (38pt default, 44 where touch targets matter)
- `Spinner` for every loading indicator (never `ActivityIndicator` directly: it needs an accessible name; pass `label` when "Loading" isn't enough)
- `ScreenState` decides loading / error / empty / content for a data screen; `EmptyState` is the empty block
- `ConfirmDialog` for confirm/cancel prompts; `BottomSheet` for slide-up sheets (no inline `Modal`s)
- `ScreenContainer` centers content on wide desktop web

## Routes
Always navigate with `routes.*` from `utils/routes.ts`: `router.push(routes.event(id))`, `routes.profileOf(id)`, `routes.eventFrom(id, from)`, `routes.host({ edit })`, `routes.settings('account')`, `routes.app()`. Never build `/event/${id}` strings or cast to `any` in screens. A path that arrives at runtime (notification deep link, `?from=`, post-sign-in redirect) must pass `isAppPath(path)` before `router.push(toRoute(path))`. Add a new route as a builder in `routes.ts` (and, if account-only, in `utils/authGate.ts`; if dynamic, in `public/serve.json`).

## Common Patterns

### Fetching data in a component
```typescript
const { data, isLoading, error, refetch } = useQuery(
  queryKey('foo', id),
  async () => {
    const { data, error } = await supabase.from('foos').select(FOO_SELECT).eq('id', id).single()
    if (error) throw error
    return data
  },
  { staleMs: STALE.detail },
)
// <ScreenState loading={isLoading} error={error ? "Could not load foo." : null} ready={!!data} onRetry={() => void refetch({ force: true })}> ... </ScreenState>
```
Cached by key across unmounts; a failed refetch keeps `data` and sets `error`. See "Database / Data Fetching" for mutations and realtime.

### Navigating tabs programmatically
```typescript
import { TABS, tabIndexOf } from '../constants/navigation'
router.replace(TABS[tabIndexOf('clubs')].path)      // route-level
const { goToTab } = useTabsShell()
goToTab(tabIndexOf('chat'))                          // inside the pager
```
Never hard-code tab indexes; use `TABS`, `tabIndexOf`, or the `*_TAB_INDEX` constants.

### Adding a new screen
Drop a file in `app/(app)/` (Expo Router picks it up), add a `routes.*` builder, and navigate with `router.push(routes.thing())` or `<Link href={routes.thing()}>`.

### Adding a new shared style
Add to `constants/styles.ts` inside the existing `StyleSheet.create({})` call, then reference as `shared.newStyle`.

## Collaboration
- It is okay — and encouraged — to ask the user clarifying questions before starting a task when the requirements are ambiguous or a decision would significantly affect the approach.

## UI Best Practices
When implementing any UI feature, follow best practices for all three target surfaces:
- **Mobile app (iOS/Android)**: touch targets ≥44pt, gesture-friendly interactions, safe area insets via `useSafeAreaInsets`, no hover-only affordances
- **Mobile web**: same touch target sizes, no iOS input-zoom (font-size ≥16px on inputs), `touch-action: manipulation` on interactive elements, `viewport-fit=cover` for safe areas, no double-tap zoom, but pinch zoom stays allowed (never `maximum-scale` / `user-scalable=no`)
- **Desktop web**: pointer/hover states where appropriate, keyboard navigation, sidebar layout at ≥768px breakpoint, reasonable max-width constraints so content doesn't stretch across a 27" monitor

Test each surface mentally when building. If a component behaves differently across surfaces, use `Platform.select` or `.web.tsx` file variants rather than runtime branching scattered throughout the component.

## Database / Data Fetching
- **Batch queries**: prefer one query with joins over multiple sequential round-trips. Use Supabase's embedded select syntax (`relation(columns)`) to fetch related data in a single request.
- **Select only what you need**: always specify columns explicitly. Never use `select('*')` on large tables — it wastes bandwidth and can expose columns unintentionally.
- **Go through `lib/query` / `lib/realtime`** (no hand-rolled `lastFetchedAt` refs in new code):
  - Reads: `useQuery(queryKey('event', id), fetcher, { staleMs: STALE.x })` (`STALE` windows live in `constants/cache.ts`) — module-level cache, deduped, survives unmount; a failed refetch keeps `data` and sets `error`. Add `useFocusRefetch(key)` to refetch on focus/foreground only when stale. `refetch({ force: true })` only for explicit user actions (pull-to-refresh).
  - Writes: `useMutation(fn, { onMutate, invalidates })` — `fn` must throw on a Supabase `{ error }`; optimistic changes go through `setQueryData` and return a rollback from `onMutate`. Outside a mutation, call `invalidate(prefix)` after a write.
  - Realtime: `useRealtimeChannel(topic, bindings, { onReconnect })`, never `supabase.channel()` directly. Subscribers sharing a topic must pass identical bindings; otherwise use a distinct topic.
- **Fetch on demand**: don't pre-fetch data for tabs or screens the user hasn't opened yet. Fetch when the tab becomes active (`useFocusEffect` or an `activeTab` effect).
- **Avoid N+1 patterns**: if you're iterating over a list and fetching per-item, restructure to a single `IN (...)` query or an embedded join instead.
- **Count with PostgREST**: use `select('id', { count: 'exact', head: true })` for counts — don't fetch full rows just to call `.length`.

## Environments & Deployment

### Single mainline (since July 2026)
- All development happens on `main` — there is no `beta` branch or beta GitHub environment
- One live Supabase project (`rmelsdqgrpfjzqisycdl`, "Vteam") serves the app; a second, **vteam beta** (`uifolvbwtrbcmfrvelnl`), exists only for CI
- CI (`.github/workflows/ci.yml`) runs unit tests on every push/PR to `main` and Playwright e2e on pull requests only; secrets are repository-level Actions secrets
- **CI never touches the live project.** The web build and e2e in CI use the **vteam beta** Supabase project (`uifolvbwtrbcmfrvelnl`; URL and public anon key are in `ci.yml`). Beta is a schema copy of live with no real user data: only reference tables (`tags`, `major_cities`, `app_config`), `external_sessions` (its own hourly Schelagg ingest), the e2e account `e2ebot` (same credentials as the `E2E_*` secrets), a fake second user `e2ebuddy`, and the seed DM between them (id in `e2e/chat.spec.ts`). Edge functions and auth email settings are not deployed there.
- **Schema changes**: tested on beta first through its ledger, applied to live when the PR merges, rolled back on beta if the PR is closed (see "Schema migrations"); CI's schema drift check enforces it.
- Only one PR's suite runs at a time (each shard is in a repo-wide `e2e-beta-supabase-<shard>` concurrency group) because runs share the e2e account and seed conversation. Overlapping suites from several PRs on the live project once exhausted its disk IO budget and made real sign-ins time out. If a queued shard shows "cancelled", re-run its failed jobs; don't remove the group

### CI e2e specifics
- The e2e job serves the static export with `npx serve dist` — dynamic routes (`/chat/[id]`, `/event/[id]`, etc.) only resolve because of the rewrite rules in `public/serve.json` (copied into `dist` on export). Add a rewrite there whenever a new dynamic route is created.
- E2e tests sign in with the `E2E_USERNAME` / `E2E_PASSWORD` repository secrets (locally: `.env`, see `.env.example`); never commit credentials. `e2e/env.ts` is the only place e2e code reads env. A seed conversation id lives in `e2e/chat.spec.ts`.

### Test layers
- **Unit (Jest)**: `npm test` (TZ=America/Chicago); `npm run test:tz` runs the suite again in UTC, Asia/Tokyo and America/Los_Angeles (a CI step), so build test times with `__tests__/helpers/clock.ts` (`localDate`, `travelTo`, `DST_DAYS`) or pin an instant, never a bare local string. Times shown to someone else (share text, reminders, the leave note) use `EVENT_TIME_ZONE` (`constants/time.ts`), never the device zone. CI runs `npm test` with `--coverage`, posts the totals and least-covered folders to the job summary (`scripts/coverage-summary.mjs`) and uploads `coverage/` as an artifact. `jest.coverageThreshold` in `package.json` is a floor a little under the current numbers: raise it when coverage grows, never lower it to get a PR through.
- **Edge functions (Deno)**: each `supabase/functions/<name>/handler.ts` exports `createHandler(deps)` and is tested by `<name>/handler.test.ts` with the fakes in `_shared/testing.ts` (fake Supabase client, `stubFetch`, no network); `index.ts` is only `Deno.serve(createHandler(defaultDeps))`. CI's Edge functions job runs `deno task lint`, `check`, `test --allow-env` (see `supabase/functions/README.md`). Merging a function change deploys it from `.github/workflows/deploy-functions.yml` after an approval on the `production` environment (`scripts/changed-functions.mjs` picks the functions; it deploys nothing until that environment has a `SUPABASE_ACCESS_TOKEN` secret). `scripts/functions-drift.mjs` compares live's deployed functions with `main` daily (skipped until a `SUPABASE_ACCESS_TOKEN` secret exists).
- **RLS / RPC integration** (`e2e/rls.spec.ts`, the `api` e2e shard): supabase-js against beta with the anon key and the e2e account, no browser. It asserts what guests can and can't read, that a user can't write rows for someone else, and the DM RPCs. Read-only: every insert is one RLS must reject. A PR that changes a policy updates its expectations there, and its row in the RLS matrix (`e2e/rls/matrix.ts`: guest read / guest insert / own-rows-only / no-insert-as-another-user per public table, probed by `e2e/rls.matrix.spec.ts` in the same shard; `__tests__/rlsMatrix.test.ts` fails when a table in `types/database.ts` has no row).
- **e2e (Playwright)**: specs must be listed in a shard in `ci.yml` to run. Signed-in specs that need data create it in `beforeAll` and delete it in `afterAll` under this run's `[e2e <tag>]` prefix (`eventsFixtures.ts`, `surfaceFixtures.ts`). For network flakes use `e2e/retry.ts`: `gotoReady(page, url, locator)` reloads only if a Supabase request failed during the load, and `withNetworkRetry(fn)` retries Node-side calls only on network errors. Real failures still fail on the first try. Playwright also retries each failed test once (`retries: 1`, with a trace).
- **Android app (Maestro)** (`.github/workflows/android-app.yml`, nightly, on demand, and on PRs touching `app.json`, `eas.json`, `*.native.*` / `*.android.*` or `e2e/android/`): `expo prebuild` + `gradlew assembleRelease` (x86_64, JS bundled in, beta database) on the free Linux runner, then the flows in `e2e/android/flows` (`config.yaml` lists them; `_ready.yaml` is the shared wait) run on an API 34 emulator: guest tabs, a `vteam://event/<id>` link and guest Join → sign-up, every intro tour step, username sign-in → Me → scorekeeper example. `e2e/android/fixture.mjs` creates the one event they open (`[e2e android-…]`, deleted after). Flows find things by `testID` (Android resource-id) or visible text; give a control a `testID` before a flow needs it. Screenshots and the JUnit report are in the `android-app-results` artifact. iOS will follow the same flows once the app is on TestFlight.
- **Before/after screenshots** (`scripts/shots/`, see its README): `npm run shots:compare -- --before <ref> --after <ref> --out shots` exports both refs for web and captures the affected screens with all Supabase traffic mocked from `scripts/shots/fixtures/` (no secrets, no network), writing `<screen>-compare.png` for each one that changed. When you add a route, add it to `SCREENS` in `scripts/shots/screens.mjs`; when a screen reads a new table or RPC, add fixture rows or a handler (unknown ones answer `[]`).
- **Accessibility (axe)** (`scripts/shots/a11y.mjs`, CI's `a11y` job): axe-core (pinned devDependency; tags `wcag2a`, `wcag2aa`, `wcag21aa`) on every `SCREENS` entry, mobile and desktop, through the same mocked harness as the screenshots. Serious and critical findings are compared with `scripts/shots/a11y-baseline.json` (screen → viewport → rule → node count): a rule new to a screen or a count above the baseline fails, and the job summary names the rule, screen and help link. Minor/moderate findings are reported only. When you fix findings (counts drop; the run passes with a note), run `npm run a11y:baseline` (or, if local counts differ from CI's, copy `a11y-baseline.next.json` from the CI `a11y-report` artifact: the baseline is CI's environment) and commit the smaller baseline; never raise it to get a PR through unless the finding is accepted on purpose and the PR says why. Locally: build the mock export (`EXPO_PUBLIC_SUPABASE_URL=https://shotsmock.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=shots-mock-anon-key npx expo export -p web --clear --output-dir dist-mock`), then `npm run a11y` (report in `a11y-report/index.html`). New screens are scanned automatically and enter the baseline only through `a11y:baseline`.
- **Startup budget** (`scripts/shots/startup-budget.mjs`, CI's `a11y` job, #225): on the mocked export, Events, Profile, Chat, Tournaments (signed in) and Events (guest) must paint within `paintMs` for a returning viewer on an 8 s server, and send no more first-visit reads than `requests`, with no duplicate read outside `allowedDuplicates` (`scripts/shots/startup-budget.json`). A failure names the new reads. `npm run startup:baseline` rewrites the budget: lower freely; raising it needs a line in the PR saying why.
- **Stability** (`scripts/shots/stability-flow.mjs`, after axe in CI's `a11y` job; `--full` nightly in `stability-nightly.yml`): on the same mocked export, the intro tour never skips a step under any Events filter (link or saved), long screens (`SCROLL_SCREENS` in `scripts/shots/stabilityCases.mjs`) don't jump or shift on refresh and come back to the same offset on Back, and every `VIEW` link round-trips (`LINK_CASES`; `__tests__/stabilityCases.test.ts` requires one per `VIEW` key). Findings beyond `scripts/shots/stability-baseline.json` fail; the baseline only shrinks (`npm run stability:baseline` after a fix). Add a new long screen to `SCROLL_SCREENS` with a child link partway down.

### Schema migrations
Live and beta have the same schema, except while an open PR is testing a change on beta. The lifecycle of every schema change:

1. **Write it in the PR** as `supabase/migrations/<timestamp>_<name>.sql` plus `<timestamp>_<name>.down.sql`, which undoes it exactly. CI's "Migration safety" step fails a new migration without its `.down.sql`.
2. **Test it on beta** (only beta) by running, on beta: `select beta_meta.apply_pr_migration(<PR number>, '<file name>', $up$<up SQL>$up$, $down$<down SQL>$down$);`. It applies the SQL and records in beta's ledger (`beta_meta.pending_changes`, beta only, not in `public`) exactly which schema objects changed. CI then allows those objects, and only those, to differ from live while that PR is open.
3. **When the PR merges** (or just before): apply the same up SQL to live (Supabase MCP `apply_migration`), regenerate `types/database.ts` from live, then run `select beta_meta.complete_pr(<PR number>);` on beta. The production deploy waits for it: every push to `main` gets a **Live schema ready** check (`.github/workflows/schema-ready.yml`, `node scripts/schema-drift.mjs --ready <sha> --wait 180`, #245) that compares only the objects of PRs merged into that commit, names any migration live is missing in its job summary, and polls every 2 minutes for 3 hours, passing on its own once you apply it. The production build waits the same way from inside Vercel: `vercel.json`'s `buildCommand` runs `scripts/vercel-schema-gate.mjs` before `npm run build:web` (production only; it tells which ledger PRs the commit contains from the migration files in the checkout, `--ready-local`, so it needs no GitHub token), polls for up to 35 minutes and then fails the build, so the previous deploy keeps serving; redeploy once the migration is on live. If the check itself can't run (network), it warns and builds anyway. Code-only commits pass in seconds. (Vercel → Settings → Deployment Checks can also require the GitHub check; it isn't needed.)
4. **If the PR is closed without merging**: run `select beta_meta.rollback_pr(<PR number>);` on beta. It runs the recorded `.down.sql` (newest first) and clears the ledger, so nothing the PR tried survives anywhere. Live never had it.

The drift check enforces this: `public.schema_fingerprint()` (both projects) returns an md5 per schema object, `public.schema_pending_changes()` (both; returns `[]` on live) exposes beta's ledger, and `npm run db:drift` (`scripts/schema-drift.mjs`) compares them. It runs in CI's Web build job on every PR and push, and daily (`.github/workflows/schema-drift.yml`; GitHub emails on failure). It fails on any difference not owned by an open PR, on a merged PR whose migration is not on live yet, and on a closed PR whose change is still on beta, and names the command to run. Intentional permanent differences are listed in `ALLOWED` in that script (today the `kudos-reminders` cron job and the `send_notification_push` webhook trigger, which notify real people and must not run on beta). Never "fix" drift by adding to `ALLOWED`, and never edit either project's schema in the Supabase dashboard or with ad-hoc SQL outside `apply_pr_migration` (beta) or a merged migration (live). Reference-table rows (`tags`, `major_cities`, `app_config`) are part of the fingerprint.

Beta is shared: an open PR's change is visible to every other PR's e2e run. Keep test changes additive, and if two open PRs change the same object, land one before testing the other.

**Expand, then contract.** A merged migration reaches live around the time its code deploys, and the installed native apps update later still. So every migration must be safe for the app version currently running: add tables, nullable columns (or NOT NULL with a default), functions, policies. Removing or reshaping something (drop, rename, type change, SET NOT NULL) is a separate later PR, once no deployed code (web or native) uses the old shape; that migration carries a line `-- contract: <why it is safe now>`. CI's "Migration safety" step (`scripts/migration-safety.mjs`, in the Web build job) fails a PR whose new migrations are destructive without that line. Dropping and recreating a policy/trigger/function in the same file is a replacement and passes.

Schema changes are usually applied directly via the Supabase MCP (`apply_migration`). Note: the migration files in `supabase/migrations/` are NOT in sync with the applied migration history — if a separate prod project is ever created, baseline it from `supabase db dump` of the live schema rather than replaying the migration files.

`types/database.ts` is generated from the live schema: after any schema change, regenerate it with `npx supabase gen types typescript --project-id rmelsdqgrpfjzqisycdl > types/database.ts` (or the Supabase MCP `generate_typescript_types`) and commit it with the change. Never hand-edit it; row types in `types/index.ts` derive from it.

### Not captured by migrations (manual setup if replicating the project)
- Storage bucket creation
- Auth settings (email templates, OAuth providers)
- Edge function secrets (`GOOGLE_MAPS_KEY`, push credentials, and for web push `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` = `https://vteamvolleyball.com`; the public key is also `EXPO_PUBLIC_VAPID_PUBLIC_KEY` in the web build's env)
- The Database Webhook `send_notification_push` (live only): table `notifications`, event Insert, type Supabase Edge Functions → `send-notification-push`, with the service-role auth header. It needs `pg_net` (enabled by migration `20261031180000_enable_pg_net.sql`) and the Database Webhooks integration installed. The drift check allows it on live only (`ALLOWED` in `scripts/schema-drift.mjs`).

## Things to Avoid
- Don't use `react-native-pager-view` — it's native-only. The custom `Pager` component is the cross-platform replacement.
- Don't import `RefreshControl` from `react-native`: on web it is a no-op stub. Import it from `components/RefreshControl` (web pull-to-refresh lives in `RefreshControl.web.tsx` + `lib/pullGesture.ts`; a unit test enforces this). Real phone browsers are checked by `.github/workflows/mobile-browsers.yml` (Android emulator Chrome + iOS Simulator Safari, nightly)
- Don't hardcode colors/spacing — always use `theme.*` (no hex or `rgba(...)` literals for colors that have a token)
- Don't write route strings or `router.push(... as any)` — use `routes.*`
- Don't put types inline in component files — add them to `types/index.ts`
- Don't use capture-phase PanResponder (`onMoveShouldSetPanResponderCapture`) for inner gesture handlers inside the tab Pager — use bubble phase so inner handlers win
- Don't add navigation logic inside reusable components — pass callbacks as props or use `useTabsShell`
- Don't hardcode the feedback email address — store it in a config constant
