# Frontend/backend request, response, and data model

The human-written explanation was reviewed against `main` at commit `c70ead2`.
The generated inventory later in this file is refreshed from the checked-out
code by `npm run docs:update` and enforced by CI.

This document describes the contracts that are visible in this repository. It
does **not** claim that the checked-in migrations reproduce the live Supabase
project: the migration folder is known to be incomplete, so the live database
must be checked before changing a table, policy, trigger, or function.

## Start here

| If you want to… | Read… |
|---|---|
| Understand the system in two minutes | [Architecture at a glance](#architecture-at-a-glance) |
| See the shape of a Supabase request and response | [What a request and response look like](#what-a-request-and-response-look-like) |
| Follow a feature end to end | [Main request flows](#main-request-flows) |
| Find every table, RPC, auth, Realtime, Storage, model, or constrained value currently referenced by code | [Generated code inventory](#generated-code-inventory) |
| Check known type/schema hazards before backend work | [Known contract gaps](#known-contract-gaps-to-resolve-before-schema-work) |

The prose and diagrams are deliberately written for humans. The repetitive
inventory is generated and committed in this same file so GitHub renders one
readable source of truth. Run:

```bash
npm run docs:update   # rewrite the generated inventory after code changes
npm run docs:check    # verify it is already current; CI runs this on every PR
```

CI does not make a follow-up commit after merge. It blocks the PR before merge
if the inventory is stale, so code and its documentation land atomically.

## Architecture at a glance

vteam does not have a conventional application API with controllers and DTOs.
The Expo/React Native frontend usually calls Supabase directly with
`@supabase/supabase-js`. The public project URL and anon key create the client;
after sign-in, Supabase attaches the user's JWT and PostgreSQL Row Level
Security (RLS) decides what that user may read or change
([`lib/supabase.ts:6`](../lib/supabase.ts#L6),
[`lib/supabase.ts:17`](../lib/supabase.ts#L17)).

```mermaid
flowchart LR
  UI[Expo Router screens / components] --> H[hooks and utilities]
  UI --> S[Supabase JS client]
  H --> S
  S --> A[Supabase Auth]
  S --> P[PostgREST tables and views]
  S --> R[PostgreSQL RPC functions]
  S --> RT[Realtime channels]
  S --> ST[Supabase Storage]
  S --> EF[Supabase Edge Functions]
  P --> DB[(PostgreSQL + RLS)]
  R --> DB
  RT --> DB
  ST --> OBJ[(Object storage)]
  EF --> GP[Google Places]
  DB -. messages INSERT webhook .-> PUSH[send-chat-push Edge Function]
  PUSH --> EXPO[Expo Push API]
  UI -. Sentry envelope .-> VT[Vercel /api/tunnel]
  VT --> SENTRY[Sentry]
```

The server-only exceptions are:

- `places-proxy`, which accepts a small JSON request and keeps the Google Maps
  key off the client
  ([`components/LocationPickerField.tsx:73`](../components/LocationPickerField.tsx#L73),
  [`supabase/functions/places-proxy/index.ts:35`](../supabase/functions/places-proxy/index.ts#L35));
- `send-chat-push`, which receives a database webhook after a message insert,
  uses the service role to find recipients, and calls Expo Push
  ([`supabase/functions/send-chat-push/index.ts:1`](../supabase/functions/send-chat-push/index.ts#L1));
- `/api/tunnel`, a Vercel function that validates and forwards Sentry envelopes
  ([`api/tunnel.ts:5`](../api/tunnel.ts#L5)).

### Why the venue picker calls Places the way it does

Google Places is the only metered third-party API in the app, so the client
side of `places-proxy` is shaped around *not* spending it. Five deliberate
mechanisms, all in
[`components/LocationPickerField.tsx`](../components/LocationPickerField.tsx):

1. **A session token per modal open.** Autocomplete requests and the closing
   Place Details lookup share one `sessiontoken`, so Google bills the whole
   search as a single session instead of per keystroke. A fresh token is minted
   on each open, and the token is spent by the Details call on selection.
2. **A three-character floor and a 600ms debounce.** Nothing reaches the
   network until the query is worth running, which collapses a typed venue name
   into roughly one request.
3. **A two-layer cache.** A module-level `Map` for the session and a 24h
   `AsyncStorage` entry keyed `gmaps:<v>:<query>` across launches. A cache hit
   returns predictions without a request *and* without consuming the session
   token.
4. **Recent and common venues are answered locally.** Re-picking a venue the
   host has used before, or one of the `LOCATIONS` constants, resolves from
   state with zero Places traffic — which is the dominant case for a club that
   plays the same gyms every week.
5. **`fields=geometry` on Details.** The narrowest Basic-Data field set, so the
   closing call stays in the cheapest tier.

Note that `latitude`/`longitude` are currently **write-only**: they are stored
and round-tripped through the host form, but nothing reads them — "Show in
Maps" builds a text query from `location` instead
([`components/event/DetailsTab.tsx:22`](../components/event/DetailsTab.tsx#L22)).
The Details call is kept anyway because it fires once per *saved event* rather
than per keystroke, so its volume is negligible, and dropping it would discard
the coordinates that a future distance sort or map view would need.

## What a request and response look like

| Interface | Request shape | Response shape | Contract location |
|---|---|---|---|
| Auth | `supabase.auth.<operation>(payload)` | Supabase `{ data, error }`; session changes also arrive through `onAuthStateChange` | [`app/(auth)/login.tsx:98`](../app/%28auth%29/login.tsx#L98), [`lib/socialAuth.ts:11`](../lib/socialAuth.ts#L11), [`hooks/useAuth.ts:15`](../hooks/useAuth.ts#L15) |
| Table/view read | `.from(table).select(projection)` plus filters, ordering, range, or count options | `{ data, error, count, status, ... }`; `data` is an array unless `.single()`/`.maybeSingle()` is used | [`hooks/useMonthEvents.ts`](../hooks/useMonthEvents.ts), [`hooks/useNotifications.ts:29`](../hooks/useNotifications.ts#L29) |
| Table write | `.insert()`, `.upsert()`, `.update()`, or `.delete()`; append `.select()` only when returned rows are needed | Metadata/error only by default; inserted/updated rows when followed by `.select()` | [`app/(app)/host.tsx:276`](../app/%28app%29/host.tsx#L276), [`hooks/useMessages.ts:180`](../hooks/useMessages.ts#L180) |
| Database RPC | `supabase.rpc(name, namedArguments?)` | Function-specific `data` plus `error` | [`hooks/useConversations.ts:14`](../hooks/useConversations.ts#L14), [`utils/eventCardPreviews.ts:23`](../utils/eventCardPreviews.ts#L23) |
| Realtime | `.channel().on('postgres_changes', filter, callback).subscribe()` | Change payload (`new`/`old` rows); the app often re-fetches a fully joined row after receiving it | [`hooks/useMessages.ts:82`](../hooks/useMessages.ts#L82), [`hooks/useConversations.ts:48`](../hooks/useConversations.ts#L48) |
| Storage | bucket-scoped `upload`, `remove`, `getPublicUrl`, or signed URL operations | `{ data, error }`; database rows store an object path or URL | [`hooks/useMessages.ts:258`](../hooks/useMessages.ts#L258), [`constants/storage.ts:1`](../constants/storage.ts#L1) |
| Edge Function | `supabase.functions.invoke(name, { body })` | Parsed response body as `data` plus `error` | [`components/LocationPickerField.tsx:73`](../components/LocationPickerField.tsx#L73) |

PostgREST projections are also response schemas. For example, a relationship
selection such as `profiles!events_created_by_fkey (...)` produces a nested
`profiles` object, while `event_attendees_attending(count)` produces a
one-element count array. Aliases such as
`my_attendance:event_attendees_attending(user_id)` become response property
names. The canonical event-card projection is centralized in
[`constants/events.ts:92`](../constants/events.ts#L92), and the matching joined
response is `EventWithDetails`
([`types/index.ts:253`](../types/index.ts#L253)).

The TypeScript types are handwritten assertions about those response shapes;
there is no generated Supabase `Database` type parameter on `createClient`.
Many call sites therefore cast returned rows with `as`, `as unknown as`, or
`any`. TypeScript validates use after the cast, but it cannot prove the live
database returned the claimed shape.

## Main request flows

### Authentication and session

```mermaid
sequenceDiagram
  participant Screen as Login/register screen
  participant Auth as Supabase Auth
  participant DB as Postgres
  participant App as Auth hook/router
  Screen->>DB: get_email_by_username(username), when login uses username
  DB-->>Screen: email or null
  Screen->>Auth: signInWithPassword / signUp / OAuth / OTP
  Auth-->>Screen: user, session, or error
  Auth-->>App: onAuthStateChange(session)
  App->>DB: profile reads under the user's JWT and RLS
```

- Password login optionally resolves a username through
  `get_email_by_username(p_username)` and then calls
  `signInWithPassword({ email, password })`
  ([`app/(auth)/login.tsx:103`](../app/%28auth%29/login.tsx#L103)).
- Registration checks `profiles.username`, calls `auth.signUp`, and updates the
  trigger-created profile with names
  ([`app/(auth)/register.tsx:55`](../app/%28auth%29/register.tsx#L55)).
- OAuth supports authorization-code or access/refresh-token callbacks; native
  Apple login can exchange an identity token directly
  ([`lib/socialAuth.ts:11`](../lib/socialAuth.ts#L11),
  [`lib/socialAuth.ts:66`](../lib/socialAuth.ts#L66)).
- The session is persisted in AsyncStorage on client platforms. Static web
  export uses no-op storage and does not persist a server-render session
  ([`lib/supabase.ts:9`](../lib/supabase.ts#L9)).

### Event lists and event detail

```mermaid
sequenceDiagram
  participant UI as Events screen
  participant Hook as useMonthEvents
  participant REST as PostgREST
  participant RPC as get_event_card_attendee_previews
  UI->>Hook: mount, select month, or refresh
  Hook->>REST: events + host + counts + tags + club + viewer RSVP
  REST-->>Hook: EventWithDetails[] without avatar previews
  Hook-->>UI: date-ordered cards (painted immediately)
  Hook->>RPC: p_event_ids: uuid[]
  RPC-->>Hook: up to 3 attendee profiles per event
  Hook-->>UI: same cards with avatar previews
```

- The feed paints as soon as the event rows arrive; at most three attendee
  previews per event follow from a second RPC and are merged into the cached
  month only if no newer fetch replaced it meanwhile
  ([`hooks/useMonthEvents.ts`](../hooks/useMonthEvents.ts),
  [`utils/eventCardPreviews.ts`](../utils/eventCardPreviews.ts)). The
  preview RPC is `SECURITY INVOKER`, so it retains the caller's database
  permissions
  ([`supabase/migrations/20260811030000_event_card_attendee_previews_rpc.sql:2`](../supabase/migrations/20260811030000_event_card_attendee_previews_rpc.sql#L2)).
- `useMonthEvents` performs the event and tournament reads in parallel over a
  month span, normalizes tournaments into the `EventWithDetails` card shape, and
  marks them with the UI-only `_isTournament` flag
  ([`hooks/useMonthEvents.ts:28`](../hooks/useMonthEvents.ts#L28),
  [`hooks/useMonthEvents.ts:127`](../hooks/useMonthEvents.ts#L127)).
- `events.event_date` is an instant, but calendars group it by the viewer's
  local day. Suffix-less PostgREST timestamps are interpreted as UTC before
  `eventLocalDateKey` derives the shared `YYYY-MM-DD` key used by dots and
  feed sections; month queries use local-midnight boundaries converted to ISO
  instants
  ([`utils/index.ts:170`](../utils/index.ts#L170),
  [`utils/index.ts:193`](../utils/index.ts#L193),
  [`utils/monthKeys.ts:19`](../utils/monthKeys.ts#L19)).
- Event detail fetches the event, creator, full attendee/profile rows, and tags.
  It then fetches comments plus guests/cohosts in additional requests
  ([`app/(app)/event/[id].tsx:464`](../app/%28app%29/event/%5Bid%5D.tsx#L464)).
- Creating or editing an event is a client-orchestrated series of writes:
  `events`, then `event_tags`, optionally `user_event_templates`, plus waitlist
  updates on capacity changes
  ([`app/(app)/host.tsx:270`](../app/%28app%29/host.tsx#L270)). These steps are not
  wrapped in one database transaction, so a later failure can leave an earlier
  write committed. On edit, tag writes are narrowed to the difference between
  the loaded database set and current form selection: additions are inserted,
  removals target only dropped IDs, and an unchanged set performs no tag write.
  If removal fails after additions land, the client compensates by deleting
  those additions before showing the partial-save warning; a failed
  compensation is reported as an uncertain tag state rather than as unchanged
  ([`app/(app)/host.tsx:327`](../app/%28app%29/host.tsx#L327),
  [`utils/index.ts:471`](../utils/index.ts#L471)).
- Price has separate form and persistence contracts. `CreateEventForm.priceText`
  preserves in-progress decimal input as text; the submit boundary sanitizes
  and converts it once to the `events.price` number, rounded to cents, with
  empty or zero represented as `null`. Response formatting then renders
  fractional values with two decimal places
  ([`types/index.ts:305`](../types/index.ts#L305),
  [`utils/index.ts:171`](../utils/index.ts#L171),
  [`utils/index.ts:190`](../utils/index.ts#L190),
  [`app/(app)/host.tsx:278`](../app/%28app%29/host.tsx#L278)).

The event entity cluster is:

```mermaid
erDiagram
  PROFILE ||--o{ EVENT : creates
  PROFILE ||--o{ EVENT_ATTENDEE : joins
  EVENT ||--o{ EVENT_ATTENDEE : has
  EVENT ||--o{ EVENT_GUEST : has
  PROFILE ||--o{ EVENT_GUEST : adds
  EVENT ||--o{ EVENT_COHOST : delegates
  PROFILE ||--o{ EVENT_COHOST : cohosts
  EVENT ||--o{ EVENT_COMMENT : discusses
  PROFILE ||--o{ EVENT_COMMENT : authors
  EVENT_COMMENT o|--o{ EVENT_COMMENT : replies
  EVENT ||--o{ CHEER : recognizes
  PROFILE ||--o{ CHEER : gives
  PROFILE ||--o{ CHEER : receives
  EVENT ||--o{ EVENT_TAG : categorized_by
  TAG ||--o{ EVENT_TAG : categorizes
  CLUB o|--o{ EVENT : owns
```

### Profiles and cheers

- The own-profile screen loads the signed-in `profiles` row and an exact,
  head-only count of `cheers` rows where that profile is the receiver in
  parallel. Pull-to-refresh repeats both the profile and Cheers reads; a failed
  count refresh retains the last known value instead of replacing it with a
  misleading zero. The same receiver relationship drives the existing Cheers
  detail screen, so the card total and detail total share one database contract
  ([`app/(app)/(tabs)/(main)/profile/index.tsx`](../app/%28app%29/%28tabs%29/%28main%29/profile/index.tsx),
  [`app/(app)/(tabs)/settings/cheers.tsx`](../app/%28app%29/%28tabs%29/settings/cheers.tsx)).

### Clubs

Club screens use direct PostgREST reads and writes:

- `clubs` belongs to a `major_cities` row and has many `club_members`; the
  creator is inserted as an owner by a database trigger
  ([`types/index.ts:337`](../types/index.ts#L337),
  [`supabase/migrations/20260419120000_club_creation_and_location.sql:20`](../supabase/migrations/20260419120000_club_creation_and_location.sql#L20)).
- A club has events and a feed of `club_posts`; posts have `club_post_likes` and
  `club_post_comments`. The checked-in RLS policies allow members to read and
  interact while only owners create posts
  ([`supabase/migrations/20260421120000_club_posts.sql:47`](../supabase/migrations/20260421120000_club_posts.sql#L47)).
- Club images are uploaded to `club-avatars`; the database stores their object
  path
  ([`app/(app)/club/[id].tsx:257`](../app/%28app%29/club/%5Bid%5D.tsx#L257)).

```mermaid
erDiagram
  MAJOR_CITY ||--o{ CLUB : locates
  PROFILE ||--o{ CLUB : creates
  CLUB ||--o{ CLUB_MEMBER : has
  PROFILE ||--o{ CLUB_MEMBER : joins
  CLUB ||--o{ CLUB_POST : publishes
  PROFILE ||--o{ CLUB_POST : authors
  CLUB_POST ||--o{ CLUB_POST_LIKE : receives
  PROFILE ||--o{ CLUB_POST_LIKE : gives
  CLUB_POST ||--o{ CLUB_POST_COMMENT : has
  PROFILE ||--o{ CLUB_POST_COMMENT : authors
```

### Chat

- The conversation list is not assembled in the client. The frontend invokes
  `get_my_conversations()` and casts its result to `ConversationRow[]`; that row
  includes the last message, unread count, other DM member, or club identity
  ([`hooks/useConversations.ts:14`](../hooks/useConversations.ts#L14),
  [`types/index.ts:480`](../types/index.ts#L480)).
- Opening a DM invokes `find_or_create_dm(other_user_id)` and expects one
  conversation UUID
  ([`app/(app)/(tabs)/(main)/chat.tsx:193`](../app/%28app%29/%28tabs%29/chat.tsx#L193)).
- A message page fetches 40 messages at a time with sender and reaction embeds,
  then separately fetches referenced reply messages to avoid an ambiguous
  self-join
  ([`hooks/useMessages.ts:6`](../hooks/useMessages.ts#L6),
  [`hooks/useMessages.ts:17`](../hooks/useMessages.ts#L17)).
- Sending inserts a `messages` row and asks PostgREST to return the joined
  `MessageWithDetails` projection. An optimistic `_sending` row exists only in
  client memory until confirmation
  ([`hooks/useMessages.ts:137`](../hooks/useMessages.ts#L137),
  [`types/index.ts:524`](../types/index.ts#L524)).
- Realtime `messages` and `message_reactions` changes update or re-fetch client
  state. `mark_conversation_read(p_conversation_id)` updates server-side read
  state
  ([`hooks/useMessages.ts:88`](../hooks/useMessages.ts#L88),
  [`hooks/useMessages.ts:292`](../hooks/useMessages.ts#L292)).
- Image messages upload to the public `chat-images` bucket and store the public
  URL in `messages.image_url`
  ([`hooks/useMessages.ts:258`](../hooks/useMessages.ts#L258)).
- A message insert can independently trigger the `send-chat-push` database
  webhook. That service-role flow does not participate in the frontend insert
  response; push delivery is asynchronous and best-effort.

```mermaid
erDiagram
  CONVERSATION ||--o{ CONVERSATION_MEMBER : includes
  PROFILE ||--o{ CONVERSATION_MEMBER : participates
  CLUB o|--o| CONVERSATION : owns
  CONVERSATION ||--o{ MESSAGE : contains
  PROFILE ||--o{ MESSAGE : sends
  MESSAGE o|--o{ MESSAGE : replies_to
  MESSAGE ||--o{ MESSAGE_REACTION : receives
  PROFILE ||--o{ MESSAGE_REACTION : reacts
  PROFILE ||--o{ CHAT_SILENCE : configures
  PROFILE ||--o{ CHAT_SILENCE : is_hidden
  PROFILE ||--o{ PUSH_TOKEN : registers
```

`Conversation` and `ConversationMember` raw-row types are notably absent from
`types/index.ts`; the principal client contract is the RPC response
`ConversationRow`.

### Notifications and badges

- The inbox reads at most 80 `notifications` rows. The unread badge uses an
  exact, `head: true` count so row bodies are not downloaded
  ([`hooks/useNotifications.ts:23`](../hooks/useNotifications.ts#L23),
  [`hooks/useNotifications.ts:38`](../hooks/useNotifications.ts#L38)).
- `mark_notification_read` and `mark_all_notifications_read` are
  security-definer RPCs that still scope updates to `auth.uid()`
  ([`supabase/migrations/20260402120000_notifications_inbox.sql:97`](../supabase/migrations/20260402120000_notifications_inbox.sql#L97)).
- Checked-in triggers fan out event announcements, material event changes,
  cancellations, and waitlist promotions into inbox rows
  ([`supabase/migrations/20260402120100_notifications_triggers.sql:7`](../supabase/migrations/20260402120100_notifications_triggers.sql#L7)).
- Badge qualification is currently client-orchestrated: the utility reads
  attendance/events/cheers, plans awards, inserts or updates `user_badges`, and
  inserts badge notifications
  ([`utils/badges.ts:25`](../utils/badges.ts#L25),
  [`utils/badges.ts:178`](../utils/badges.ts#L178)).
- Notification preferences are JSON in `profiles.notification_prefs`, keyed by
  notification type and channel (`in_app` or `push`)
  ([`types/index.ts:69`](../types/index.ts#L69)).

### Tournaments

Tournament creation inserts the parent `tournaments` row and then its
one-to-one `tournament_rules` row; this is another client-orchestrated,
non-transactional sequence
([`app/(app)/tournament/create.tsx:668`](../app/%28app%29/tournament/create.tsx#L668)).
Tournament detail then loads the parent/rules/prizes in parallel and separately
loads teams, members, invitations, join requests, discussion, pools, matches,
and sets as the screen needs them
([`app/(app)/tournament/[id].tsx:168`](../app/%28app%29/tournament/%5Bid%5D.tsx#L168)).

```mermaid
erDiagram
  CLUB ||--o{ TOURNAMENT : hosts
  PROFILE ||--o{ TOURNAMENT : creates
  TOURNAMENT ||--|| TOURNAMENT_RULES : has
  TOURNAMENT ||--o{ TOURNAMENT_TEAM : registers
  TOURNAMENT_TEAM ||--o{ TOURNAMENT_TEAM_MEMBER : rosters
  PROFILE ||--o{ TOURNAMENT_TEAM_MEMBER : joins
  TOURNAMENT ||--o{ TOURNAMENT_POOL : divides
  TOURNAMENT_POOL ||--o{ TOURNAMENT_POOL_TEAM : assigns
  TOURNAMENT_TEAM ||--o{ TOURNAMENT_POOL_TEAM : placed_in
  TOURNAMENT ||--o{ TOURNAMENT_MATCH : schedules
  TOURNAMENT_MATCH ||--o{ TOURNAMENT_SET : scores
  TOURNAMENT ||--o{ TOURNAMENT_COMMENT : discusses
  TOURNAMENT ||--o{ TOURNAMENT_PRIZE : awards
  TOURNAMENT_TEAM ||--o{ TOURNAMENT_TEAM_INVITATION : invites
  TOURNAMENT_TEAM ||--o{ TOURNAMENT_TEAM_JOIN_REQUEST : receives
```

### Proxied and asynchronous external calls

These are the only bespoke HTTP request/response contracts in the repository:

| Path | Inbound request | Outbound request | Response to caller |
|---|---|---|---|
| `places-proxy` autocomplete | `POST { action: 'autocomplete', input, sessiontoken }` through `functions.invoke` | Google Places autocomplete query, restricted to the US and biased toward Austin. No `types` filter, so both named establishments and street addresses come back | Google JSON; the component reads `predictions[]` with `place_id`, `description`, `types`, and `structured_formatting` |
| `places-proxy` details | `POST { action: 'details', place_id, sessiontoken }` | Google Place Details query for `geometry` | Google JSON; the component reads `result.geometry.location.{lat,lng}` |
| `send-chat-push` | Database webhook `POST` whose `record` has message `id`, `conversation_id`, `sender_id`, `content`, and `image_url` | One Expo Push message per recipient token | Plain-text `OK`, `No recipients`, or `No tokens`; this response goes to the webhook, not the app |
| `/api/tunnel` | Raw Sentry envelope in an HTTP `POST` | Same envelope to the `sentry.io` project encoded by its DSN | Empty response with the upstream status; invalid envelopes/hosts return 400 and non-POST methods return 405 |
| `/event/<uuid>` → `/api/event-page` | `GET`/`HEAD` from a person or a link-preview crawler (vercel.json route, after `handle: filesystem`) | PostgREST with the anon key: `events?select=EVENT_PREVIEW_COLUMNS&id=eq.<id>` plus `HEAD` counts of `event_attendees_attending` and `event_guests_attending` | `dist/index.html` with `<title>`, `og:*`, `twitter:*` injected in the head (escaped; body unchanged), `s-maxage=300, stale-while-revalidate=600`; unknown id or read failure → generic vteam tags |
| `/api/og/event?id=<uuid>` | `GET` from a crawler following `og:image` | Same anon reads; fonts from `/og-fonts/*.ttf` on the same deployment | 1200×630 PNG card (time, date, title, place, price, spots / Cancelled / Ended); no or unknown id → generic card |

The exact Places bodies and parsed response fields are declared in
[`components/LocationPickerField.tsx:14`](../components/LocationPickerField.tsx#L14)
and validated/routed in
[`supabase/functions/places-proxy/index.ts:35`](../supabase/functions/places-proxy/index.ts#L35).
The push webhook payload starts at
[`supabase/functions/send-chat-push/index.ts:23`](../supabase/functions/send-chat-push/index.ts#L23),
and the Sentry forwarding contract is implemented in
[`api/tunnel.ts:5`](../api/tunnel.ts#L5).

## Model catalog

The canonical frontend model file is [`types/index.ts`](../types/index.ts). Its
types fall into four groups:

| Kind | Models | Meaning |
|---|---|---|
| Database row | `Profile`, `Event`, `EventAttendee`, `EventComment`, `EventGuest`, `EventCohost`, `Cheer`, `Tag`, `UserEventTemplate`, `MajorCity`, `Club`, `ClubMember`, club post models, `Notification`, `Message`, `MessageReaction`, `ChatSilence`, `UserBadge`, and tournament models | Intended to mirror one persisted table row. Optional properties often represent columns added after the original model. |
| Joined/query response | `EventWithDetails`, `EventAttendeeWithProfile`, `EventCommentWithAuthor`, `ClubWithDetails`, `ClubPostWithFeed`, `ConversationRow`, `MessageWithDetails`, `ChatSilenceWithProfile`, `TournamentCommentWithAuthor`, `TournamentTeamWithRoster` | Match a particular PostgREST projection or RPC, including nested relationship aliases and aggregates. |
| Form/request | `CreateEventForm`, `TournamentDraft`, `LocationValue` | Local UI state. Dates may be `Date` objects and names may be camelCase; submit handlers convert them to database columns/ISO strings. |
| Derived/UI-only | `AttendanceStatus`, `TeamAssignment`; `_isTournament`, `_sending`, `attendee_previews`, and `my_attendance` fields | Calculated or transient state that must never be assumed to be a database column. |

<!-- BEGIN GENERATED: code-inventory -->
## Generated code inventory

> Do not edit this section by hand. Run `npm run docs:update` and commit the
> result. CI runs `npm run docs:check` and blocks a merge if it is stale.
>
> Inventory fingerprint: `27a6e222272a`

This inventory is generated from the repository's TypeScript and SQL. It is the
fast lookup layer; the surrounding prose explains intent and relationships.

### Direct table and view calls

<details>
<summary>54 tables/views referenced by code</summary>

| Table or view | Frontend/server call sites |
|---|---|
| `ad_banners` | [`lib/startupConfig.ts:37`](../lib/startupConfig.ts#L37) |
| `app_admins` | [`supabase/functions/generate-badge-art/index.ts:82`](../supabase/functions/generate-badge-art/index.ts#L82) |
| `app_config` | [`lib/startupConfig.ts:33`](../lib/startupConfig.ts#L33) |
| `app_events` | [`lib/analytics.ts:159`](../lib/analytics.ts#L159) |
| `badge_art` | [`hooks/useBadgeArt.ts:26`](../hooks/useBadgeArt.ts#L26)<br>[`supabase/functions/generate-badge-art/index.ts:130`](../supabase/functions/generate-badge-art/index.ts#L130) |
| `chat_silences` | [`hooks/useSilencedUsers.ts:27`](../hooks/useSilencedUsers.ts#L27)<br>[`supabase/functions/send-chat-push/handler.ts:143`](../supabase/functions/send-chat-push/handler.ts#L143) |
| `cheers` | [`hooks/event/useEventCheers.ts:16`](../hooks/event/useEventCheers.ts#L16)<br>[`hooks/useCheersSummary.ts:12`](../hooks/useCheersSummary.ts#L12)<br>[`hooks/useMyGameRecap.ts:18`](../hooks/useMyGameRecap.ts#L18)<br>[`hooks/useMyProfile.ts:72`](../hooks/useMyProfile.ts#L72)<br>[`hooks/useUserProfile.ts:21`](../hooks/useUserProfile.ts#L21)<br>[`utils/badges.ts:41`](../utils/badges.ts#L41) |
| `club_members` | [`app/(app)/(tabs)/(main)/clubs.tsx:87`](../app/%28app%29/%28tabs%29/%28main%29/clubs.tsx#L87)<br>[`app/(app)/chat/[id].tsx:95`](../app/%28app%29/chat/%5Bid%5D.tsx#L95)<br>[`app/(app)/club/[id].tsx:142`](../app/%28app%29/club/%5Bid%5D.tsx#L142)<br>[`app/(app)/tournament/create.tsx:774`](../app/%28app%29/tournament/create.tsx#L774)<br>[`hooks/host/useHostContext.ts:27`](../hooks/host/useHostContext.ts#L27) |
| `club_post_comments` | [`components/ClubPostCard.tsx:99`](../components/ClubPostCard.tsx#L99) |
| `club_post_likes` | [`components/ClubPostCard.tsx:71`](../components/ClubPostCard.tsx#L71) |
| `club_posts` | [`components/ClubPostCard.tsx:276`](../components/ClubPostCard.tsx#L276)<br>[`hooks/useClub.ts:72`](../hooks/useClub.ts#L72) |
| `clubs` | [`app/(app)/(tabs)/(main)/clubs.tsx:224`](../app/%28app%29/%28tabs%29/%28main%29/clubs.tsx#L224)<br>[`app/(app)/club/[id].tsx:223`](../app/%28app%29/club/%5Bid%5D.tsx#L223)<br>[`app/(app)/club/create.tsx:65`](../app/%28app%29/club/create.tsx#L65)<br>[`hooks/useClub.ts:54`](../hooks/useClub.ts#L54) |
| `conversation_members` | [`supabase/functions/send-chat-push/handler.ts:127`](../supabase/functions/send-chat-push/handler.ts#L127) |
| `conversations` | [`hooks/useConversations.ts:276`](../hooks/useConversations.ts#L276)<br>[`supabase/functions/send-chat-push/handler.ts:126`](../supabase/functions/send-chat-push/handler.ts#L126) |
| `event_attendee_denials` | [`hooks/event/useMyDenialReason.ts:8`](../hooks/event/useMyDenialReason.ts#L8) |
| `event_attendees` | [`hooks/event/useEventAttendance.ts:110`](../hooks/event/useEventAttendance.ts#L110)<br>[`hooks/event/useEventTeams.ts:92`](../hooks/event/useEventTeams.ts#L92)<br>[`hooks/useMonthEvents.ts:610`](../hooks/useMonthEvents.ts#L610)<br>[`hooks/useMyGameRecap.ts:19`](../hooks/useMyGameRecap.ts#L19)<br>[`hooks/useMyUpcomingEvents.ts:100`](../hooks/useMyUpcomingEvents.ts#L100)<br>[`utils/badges.ts:25`](../utils/badges.ts#L25) |
| `event_cohosts` | [`hooks/event/useCohosts.ts:54`](../hooks/event/useCohosts.ts#L54)<br>[`hooks/event/useEventData.ts:62`](../hooks/event/useEventData.ts#L62) |
| `event_comments` | [`hooks/event/useEventComments.ts:41`](../hooks/event/useEventComments.ts#L41)<br>[`hooks/event/useEventData.ts:82`](../hooks/event/useEventData.ts#L82) |
| `event_guests` | [`hooks/event/useEventAttendance.ts:336`](../hooks/event/useEventAttendance.ts#L336)<br>[`hooks/event/useEventData.ts:52`](../hooks/event/useEventData.ts#L52)<br>[`hooks/event/useEventTeams.ts:103`](../hooks/event/useEventTeams.ts#L103) |
| `event_guests_attending` | [`hooks/event/useEventData.ts:44`](../hooks/event/useEventData.ts#L44) |
| `event_payments` | [`hooks/event/useEventPayments.ts:13`](../hooks/event/useEventPayments.ts#L13) |
| `events` | [`components/event/EventDetailScreen.tsx:281`](../components/event/EventDetailScreen.tsx#L281)<br>[`hooks/event/useEventData.ts:31`](../hooks/event/useEventData.ts#L31)<br>[`hooks/host/useHostContext.ts:44`](../hooks/host/useHostContext.ts#L44)<br>[`hooks/host/useHostForm.ts:63`](../hooks/host/useHostForm.ts#L63)<br>[`hooks/useClub.ts:46`](../hooks/useClub.ts#L46)<br>[`hooks/useEventHistory.ts:18`](../hooks/useEventHistory.ts#L18)<br>+5 more files |
| `external_programs` | [`hooks/useExternalPrograms.ts:25`](../hooks/useExternalPrograms.ts#L25) |
| `external_sessions` | [`hooks/useMonthEvents.ts:284`](../hooks/useMonthEvents.ts#L284) |
| `feedback_submissions` | [`app/(app)/(tabs)/settings/feedback.tsx:62`](../app/%28app%29/%28tabs%29/settings/feedback.tsx#L62)<br>[`supabase/functions/send-feedback-email/handler.ts:88`](../supabase/functions/send-feedback-email/handler.ts#L88) |
| `friend_requests` | [`hooks/useFriends.ts:37`](../hooks/useFriends.ts#L37) |
| `friendships` | [`hooks/useFriends.ts:36`](../hooks/useFriends.ts#L36) |
| `major_cities` | [`hooks/useMajorCities.ts:10`](../hooks/useMajorCities.ts#L10) |
| `message_reactions` | [`hooks/useMessages.ts:431`](../hooks/useMessages.ts#L431) |
| `messages` | [`hooks/useMessages.ts:85`](../hooks/useMessages.ts#L85)<br>[`hooks/useOpenDm.ts:45`](../hooks/useOpenDm.ts#L45) |
| `notifications` | [`hooks/event/useCohosts.ts:66`](../hooks/event/useCohosts.ts#L66)<br>[`hooks/event/useEventAttendance.ts:91`](../hooks/event/useEventAttendance.ts#L91)<br>[`hooks/useNotifications.ts:35`](../hooks/useNotifications.ts#L35)<br>[`utils/badges.ts:233`](../utils/badges.ts#L233) |
| `point_balances` | [`hooks/usePoints.ts:24`](../hooks/usePoints.ts#L24) |
| `point_events` | [`hooks/useMyGameRecap.ts:17`](../hooks/useMyGameRecap.ts#L17) |
| `profiles` | [`app/(auth)/register.tsx:69`](../app/%28auth%29/register.tsx#L69)<br>[`hooks/event/useEventData.ts:110`](../hooks/event/useEventData.ts#L110)<br>[`hooks/tournament/api.ts:193`](../hooks/tournament/api.ts#L193)<br>[`hooks/useMessages.ts:68`](../hooks/useMessages.ts#L68)<br>[`hooks/useMyProfile.ts:112`](../hooks/useMyProfile.ts#L112)<br>[`hooks/useUserProfile.ts:20`](../hooks/useUserProfile.ts#L20)<br>+4 more files |
| `push_receipts` | [`supabase/functions/check-push-receipts/handler.ts:42`](../supabase/functions/check-push-receipts/handler.ts#L42)<br>[`supabase/functions/send-chat-push/handler.ts:225`](../supabase/functions/send-chat-push/handler.ts#L225)<br>[`supabase/functions/send-notification-push/handler.ts:174`](../supabase/functions/send-notification-push/handler.ts#L174) |
| `push_tokens` | [`supabase/functions/check-push-receipts/handler.ts:87`](../supabase/functions/check-push-receipts/handler.ts#L87)<br>[`supabase/functions/send-chat-push/handler.ts:152`](../supabase/functions/send-chat-push/handler.ts#L152)<br>[`supabase/functions/send-notification-push/handler.ts:109`](../supabase/functions/send-notification-push/handler.ts#L109)<br>[`utils/pushNotifications.ts:101`](../utils/pushNotifications.ts#L101)<br>[`utils/pushNotifications.web.ts:66`](../utils/pushNotifications.web.ts#L66) |
| `rate_limits` | [`supabase/functions/login-with-username/handler.ts:67`](../supabase/functions/login-with-username/handler.ts#L67) |
| `sponsored_events` | [`lib/startupConfig.ts:40`](../lib/startupConfig.ts#L40) |
| `tags` | [`hooks/useTags.ts:14`](../hooks/useTags.ts#L14) |
| `tournament_comments` | [`hooks/tournament/api.ts:141`](../hooks/tournament/api.ts#L141) |
| `tournament_matches` | [`hooks/tournament/api.ts:170`](../hooks/tournament/api.ts#L170) |
| `tournament_pools` | [`hooks/tournament/api.ts:179`](../hooks/tournament/api.ts#L179) |
| `tournament_prizes` | [`hooks/tournament/api.ts:114`](../hooks/tournament/api.ts#L114) |
| `tournament_rules` | [`app/(app)/tournament/create.tsx:732`](../app/%28app%29/tournament/create.tsx#L732)<br>[`hooks/tournament/api.ts:103`](../hooks/tournament/api.ts#L103) |
| `tournament_sets` | [`hooks/tournament/api.ts:415`](../hooks/tournament/api.ts#L415) |
| `tournament_team_invitations` | [`hooks/tournament/api.ts:199`](../hooks/tournament/api.ts#L199) |
| `tournament_team_join_requests` | [`hooks/tournament/api.ts:203`](../hooks/tournament/api.ts#L203) |
| `tournament_team_members` | [`hooks/tournament/api.ts:195`](../hooks/tournament/api.ts#L195) |
| `tournament_teams` | [`hooks/tournament/api.ts:126`](../hooks/tournament/api.ts#L126) |
| `tournament_trophies` | [`hooks/tournament/api.ts:466`](../hooks/tournament/api.ts#L466) |
| `tournaments` | [`app/(app)/tournament/create.tsx:704`](../app/%28app%29/tournament/create.tsx#L704)<br>[`hooks/tournament/api.ts:112`](../hooks/tournament/api.ts#L112)<br>[`hooks/useMonthEvents.ts:275`](../hooks/useMonthEvents.ts#L275)<br>[`hooks/useTournamentList.ts:22`](../hooks/useTournamentList.ts#L22) |
| `user_badges` | [`hooks/useBadges.ts:53`](../hooks/useBadges.ts#L53)<br>[`hooks/useUserProfile.ts:22`](../hooks/useUserProfile.ts#L22)<br>[`utils/badges.ts:186`](../utils/badges.ts#L186) |
| `user_event_templates` | [`app/(app)/host.tsx:142`](../app/%28app%29/host.tsx#L142)<br>[`hooks/host/useHostContext.ts:61`](../hooks/host/useHostContext.ts#L61) |
| `user_settings` | [`hooks/useHiddenFeed.ts:28`](../hooks/useHiddenFeed.ts#L28)<br>[`hooks/useMyProfile.ts:127`](../hooks/useMyProfile.ts#L127)<br>[`hooks/useUserSettings.ts:26`](../hooks/useUserSettings.ts#L26)<br>[`supabase/functions/send-notification-push/handler.ts:107`](../supabase/functions/send-notification-push/handler.ts#L107) |

</details>

### Database RPC calls

| RPC | Call sites | SQL definition |
|---|---|---|
| `accept_tournament_invite` | [`hooks/tournament/api.ts:257`](../hooks/tournament/api.ts#L257) | [`supabase/migrations/20261025120000_tournament_rpcs.sql:18`](../supabase/migrations/20261025120000_tournament_rpcs.sql#L18) |
| `admin_metrics_events` | [`hooks/useAdminMetrics.ts:60`](../hooks/useAdminMetrics.ts#L60) | [`supabase/migrations/20261111150000_admin_metrics_events.sql:12`](../supabase/migrations/20261111150000_admin_metrics_events.sql#L12) |
| `admin_metrics_overview` | [`hooks/useAdminMetrics.ts:50`](../hooks/useAdminMetrics.ts#L50) | [`supabase/migrations/20261111120000_admin_metrics.sql:33`](../supabase/migrations/20261111120000_admin_metrics.sql#L33)<br>[`supabase/migrations/20261112090000_metrics_excluded_users.down.sql:4`](../supabase/migrations/20261112090000_metrics_excluded_users.down.sql#L4)<br>[`supabase/migrations/20261112090000_metrics_excluded_users.sql:27`](../supabase/migrations/20261112090000_metrics_excluded_users.sql#L27) |
| `admin_online_now` | [`hooks/useAdminMetrics.ts:71`](../hooks/useAdminMetrics.ts#L71) | [`supabase/migrations/20261111120000_admin_metrics.sql:200`](../supabase/migrations/20261111120000_admin_metrics.sql#L200) |
| `admin_reports` | [`hooks/useAdminMetrics.ts:121`](../hooks/useAdminMetrics.ts#L121) | [`supabase/migrations/20261113010000_user_reports.sql:123`](../supabase/migrations/20261113010000_user_reports.sql#L123) |
| `admin_resolve_report` | [`hooks/useAdminMetrics.ts:131`](../hooks/useAdminMetrics.ts#L131) | [`supabase/migrations/20261113010000_user_reports.sql:157`](../supabase/migrations/20261113010000_user_reports.sql#L157) |
| `admin_retention` | [`hooks/useAdminMetrics.ts:90`](../hooks/useAdminMetrics.ts#L90) | [`supabase/migrations/20261111120000_admin_metrics.sql:268`](../supabase/migrations/20261111120000_admin_metrics.sql#L268) |
| `admin_user_activity` | [`hooks/useAdminMetrics.ts:111`](../hooks/useAdminMetrics.ts#L111) | [`supabase/migrations/20261111120000_admin_metrics.sql:427`](../supabase/migrations/20261111120000_admin_metrics.sql#L427) |
| `admin_users` | [`hooks/useAdminMetrics.ts:102`](../hooks/useAdminMetrics.ts#L102) | [`supabase/migrations/20261111120000_admin_metrics.sql:339`](../supabase/migrations/20261111120000_admin_metrics.sql#L339) |
| `app_heartbeat` | [`lib/analytics.ts:224`](../lib/analytics.ts#L224) | [`supabase/migrations/20261110230000_usage_sessions.sql:74`](../supabase/migrations/20261110230000_usage_sessions.sql#L74) |
| `cancel_friend_request` | [`hooks/useFriends.ts:71`](../hooks/useFriends.ts#L71) | [`supabase/migrations/20261028203837_friends.sql:256`](../supabase/migrations/20261028203837_friends.sql#L256) |
| `check_rate_limit` | [`supabase/functions/login-with-username/handler.ts:140`](../supabase/functions/login-with-username/handler.ts#L140) | [`supabase/migrations/20261028120200_rate_limit_core.sql:19`](../supabase/migrations/20261028120200_rate_limit_core.sql#L19) |
| `claim_bring_item` | [`hooks/event/useEventBringList.ts:49`](../hooks/event/useEventBringList.ts#L49) | [`supabase/migrations/20261112190000_event_bring_items.sql:214`](../supabase/migrations/20261112190000_event_bring_items.sql#L214) |
| `complete_tournament` | [`hooks/tournament/api.ts:456`](../hooks/tournament/api.ts#L456) | [`supabase/migrations/20261028205312_tournament_trophies.sql:67`](../supabase/migrations/20261028205312_tournament_trophies.sql#L67) |
| `create_club_poll` | [`hooks/useClubPollActions.ts:26`](../hooks/useClubPollActions.ts#L26) | [`supabase/migrations/20261113180000_club_polls.sql:86`](../supabase/migrations/20261113180000_club_polls.sql#L86) |
| `current_user_is_admin` | [`hooks/useAdminMetrics.ts:31`](../hooks/useAdminMetrics.ts#L31) | [`supabase/migrations/20261028170100_ads.sql:18`](../supabase/migrations/20261028170100_ads.sql#L18) |
| `delete_account` | [`supabase/functions/delete-account/handler.ts:84`](../supabase/functions/delete-account/handler.ts#L84) | [`supabase/migrations/20261028130000_account_deletion.sql:190`](../supabase/migrations/20261028130000_account_deletion.sql#L190) |
| `find_or_create_dm` | [`hooks/useOpenDm.ts:70`](../hooks/useOpenDm.ts#L70) | [`supabase/migrations/20261028140000_rate_limits.down.sql:5`](../supabase/migrations/20261028140000_rate_limits.down.sql#L5)<br>[`supabase/migrations/20261028140000_rate_limits.sql:66`](../supabase/migrations/20261028140000_rate_limits.sql#L66) |
| `get_account_deletion_preview` | [`hooks/useAccountDeletion.ts:18`](../hooks/useAccountDeletion.ts#L18) | [`supabase/migrations/20261028130000_account_deletion.sql:166`](../supabase/migrations/20261028130000_account_deletion.sql#L166) |
| `get_ad_free_status` | [`hooks/useAdFree.ts:25`](../hooks/useAdFree.ts#L25) | [`supabase/migrations/20261028170200_ad_free_redeem.sql:48`](../supabase/migrations/20261028170200_ad_free_redeem.sql#L48) |
| `get_email_by_username` | [`supabase/functions/login-with-username/handler.ts:161`](../supabase/functions/login-with-username/handler.ts#L161) | Not checked in |
| `get_event_bring_list` | [`hooks/event/useEventBringList.ts:16`](../hooks/event/useEventBringList.ts#L16) | [`supabase/migrations/20261112190000_event_bring_items.sql:78`](../supabase/migrations/20261112190000_event_bring_items.sql#L78) |
| `get_event_card_attendee_previews` | [`utils/eventCardPreviews.ts:35`](../utils/eventCardPreviews.ts#L35) | [`supabase/migrations/20260811030000_event_card_attendee_previews_rpc.sql:2`](../supabase/migrations/20260811030000_event_card_attendee_previews_rpc.sql#L2) |
| `get_feed_span` | [`hooks/useMonthEvents.ts:219`](../hooks/useMonthEvents.ts#L219) | [`supabase/migrations/20261025220000_get_feed_span.sql:33`](../supabase/migrations/20261025220000_get_feed_span.sql#L33) |
| `get_friends_going` | [`hooks/useFriendsGoing.ts:37`](../hooks/useFriendsGoing.ts#L37) | [`supabase/migrations/20261028203837_friends.sql:354`](../supabase/migrations/20261028203837_friends.sql#L354) |
| `get_my_conversations` | [`hooks/useConversations.ts:36`](../hooks/useConversations.ts#L36) | Not checked in |
| `link_poll_event` | [`app/(app)/host.tsx:135`](../app/%28app%29/host.tsx#L135) | [`supabase/migrations/20261113180000_club_polls.sql:217`](../supabase/migrations/20261113180000_club_polls.sql#L217) |
| `mark_all_notifications_read` | [`hooks/useNotifications.ts:106`](../hooks/useNotifications.ts#L106) | [`supabase/migrations/20260402120000_notifications_inbox.sql:112`](../supabase/migrations/20260402120000_notifications_inbox.sql#L112) |
| `mark_conversation_read` | [`hooks/useConversations.ts:118`](../hooks/useConversations.ts#L118) | Not checked in |
| `mark_notification_read` | [`hooks/useNotifications.ts:93`](../hooks/useNotifications.ts#L93) | [`supabase/migrations/20260402120000_notifications_inbox.sql:98`](../supabase/migrations/20260402120000_notifications_inbox.sql#L98) |
| `redeem_ad_free` | [`hooks/useAdFree.ts:43`](../hooks/useAdFree.ts#L43) | [`supabase/migrations/20261028170200_ad_free_redeem.sql:64`](../supabase/migrations/20261028170200_ad_free_redeem.sql#L64) |
| `release_bring_item` | [`hooks/event/useEventBringList.ts:67`](../hooks/event/useEventBringList.ts#L67) | [`supabase/migrations/20261112190000_event_bring_items.sql:277`](../supabase/migrations/20261112190000_event_bring_items.sql#L277) |
| `remove_friend` | [`hooks/useFriends.ts:73`](../hooks/useFriends.ts#L73) | [`supabase/migrations/20261028203837_friends.sql:294`](../supabase/migrations/20261028203837_friends.sql#L294) |
| `replace_tournament_schedule` | [`hooks/tournament/api.ts:362`](../hooks/tournament/api.ts#L362) | [`supabase/migrations/20261025120000_tournament_rpcs.sql:100`](../supabase/migrations/20261025120000_tournament_rpcs.sql#L100) |
| `report_user` | [`hooks/useReportUser.ts:13`](../hooks/useReportUser.ts#L13) | [`supabase/migrations/20261113010000_user_reports.sql:51`](../supabase/migrations/20261113010000_user_reports.sql#L51) |
| `respond_friend_request` | [`hooks/useFriends.ts:72`](../hooks/useFriends.ts#L72) | [`supabase/migrations/20261028203837_friends.sql:216`](../supabase/migrations/20261028203837_friends.sql#L216) |
| `save_event` | [`hooks/host/useSaveEvent.ts:31`](../hooks/host/useSaveEvent.ts#L31) | [`supabase/migrations/20261113200000_save_event.sql:7`](../supabase/migrations/20261113200000_save_event.sql#L7) |
| `save_event_bring_items` | [`hooks/host/useHostBringList.ts:48`](../hooks/host/useHostBringList.ts#L48) | [`supabase/migrations/20261112190000_event_bring_items.sql:112`](../supabase/migrations/20261112190000_event_bring_items.sql#L112) |
| `search_feed` | [`hooks/useSearch.ts:25`](../hooks/useSearch.ts#L25) | [`supabase/migrations/20261113150000_search_feed.sql:40`](../supabase/migrations/20261113150000_search_feed.sql#L40) |
| `search_members` | [`lib/memberSearch.ts:19`](../lib/memberSearch.ts#L19) | [`supabase/migrations/20261028140000_rate_limits.sql:101`](../supabase/migrations/20261028140000_rate_limits.sql#L101) |
| `send_friend_request` | [`hooks/useFriends.ts:70`](../hooks/useFriends.ts#L70) | [`supabase/migrations/20261028203837_friends.sql:144`](../supabase/migrations/20261028203837_friends.sql#L144) |
| `set_best_friend` | [`hooks/useFriends.ts:74`](../hooks/useFriends.ts#L74) | [`supabase/migrations/20261028203837_friends.sql:318`](../supabase/migrations/20261028203837_friends.sql#L318) |
| `set_club_game_alerts` | [`app/(app)/club/[id].tsx:181`](../app/%28app%29/club/%5Bid%5D.tsx#L181) | [`supabase/migrations/20261113120000_new_game_alerts.sql:48`](../supabase/migrations/20261113120000_new_game_alerts.sql#L48) |
| `set_no_show` | [`hooks/event/useEventAttendance.ts:305`](../hooks/event/useEventAttendance.ts#L305) | [`supabase/migrations/20261104190000_event_no_show.sql:60`](../supabase/migrations/20261104190000_event_no_show.sql#L60) |
| `vote_club_poll` | [`hooks/useClubPollActions.ts:46`](../hooks/useClubPollActions.ts#L46) | [`supabase/migrations/20261113180000_club_polls.sql:174`](../supabase/migrations/20261113180000_club_polls.sql#L174) |

### Other Supabase surfaces

<details>
<summary>Auth, Realtime, Storage, and Edge Function call sites</summary>

| Surface | Name | Call sites |
|---|---|---|
| Auth | `exchangeCodeForSession` | [`lib/socialAuth.ts:24`](../lib/socialAuth.ts#L24) |
| Auth | `getSession` | [`app/(auth)/reset-password.tsx:48`](../app/%28auth%29/reset-password.tsx#L48)<br>[`contexts/session.tsx:35`](../contexts/session.tsx#L35)<br>[`lib/sessionUser.ts:10`](../lib/sessionUser.ts#L10) |
| Auth | `getUser` | [`contexts/session.tsx:15`](../contexts/session.tsx#L15)<br>[`lib/sessionUser.ts:6`](../lib/sessionUser.ts#L6) |
| Auth | `onAuthStateChange` | [`app/(auth)/reset-password.tsx:44`](../app/%28auth%29/reset-password.tsx#L44)<br>[`contexts/session.tsx:40`](../contexts/session.tsx#L40) |
| Auth | `resetPasswordForEmail` | [`lib/passwordReset.ts:15`](../lib/passwordReset.ts#L15) |
| Auth | `setSession` | [`lib/socialAuth.ts:27`](../lib/socialAuth.ts#L27)<br>[`lib/usernameAuth.ts:27`](../lib/usernameAuth.ts#L27)<br>[`supabase/functions/login-with-username/handler.ts:19`](../supabase/functions/login-with-username/handler.ts#L19) |
| Auth | `signInWithIdToken` | [`lib/socialAuth.ts:78`](../lib/socialAuth.ts#L78) |
| Auth | `signInWithOAuth` | [`lib/socialAuth.ts:38`](../lib/socialAuth.ts#L38) |
| Auth | `signInWithOtp` | [`lib/socialAuth.ts:89`](../lib/socialAuth.ts#L89) |
| Auth | `signInWithPassword` | [`app/(auth)/login.tsx:119`](../app/%28auth%29/login.tsx#L119)<br>[`hooks/useAccountDeletion.ts:70`](../hooks/useAccountDeletion.ts#L70) |
| Auth | `signOut` | [`app/(app)/(tabs)/settings/account.tsx:54`](../app/%28app%29/%28tabs%29/settings/account.tsx#L54)<br>[`app/(auth)/reset-password.tsx:67`](../app/%28auth%29/reset-password.tsx#L67)<br>[`hooks/useAccountDeletion.ts:63`](../hooks/useAccountDeletion.ts#L63) |
| Auth | `signUp` | [`app/(auth)/register.tsx:79`](../app/%28auth%29/register.tsx#L79) |
| Auth | `startAutoRefresh` | [`lib/supabase.ts:71`](../lib/supabase.ts#L71) |
| Auth | `stopAutoRefresh` | [`lib/supabase.ts:72`](../lib/supabase.ts#L72) |
| Auth | `updateUser` | [`app/(auth)/reset-password.tsx:64`](../app/%28auth%29/reset-password.tsx#L64) |
| Auth | `verifyOtp` | [`lib/socialAuth.ts:97`](../lib/socialAuth.ts#L97) |
| Realtime table | `chat_silences` | [`utils/chatUtils.ts:98`](../utils/chatUtils.ts#L98) |
| Realtime table | `conversation_members` | [`utils/chatUtils.ts:93`](../utils/chatUtils.ts#L93) |
| Realtime table | `message_reactions` | [`utils/chatUtils.ts:77`](../utils/chatUtils.ts#L77) |
| Realtime table | `messages` | [`utils/chatUtils.ts:71`](../utils/chatUtils.ts#L71) |
| Storage bucket | `avatars` | [`components/profile/useAvatarUploader.ts:88`](../components/profile/useAvatarUploader.ts#L88) |
| Storage bucket | `badges` | [`supabase/functions/generate-badge-art/index.ts:119`](../supabase/functions/generate-badge-art/index.ts#L119) |
| Storage bucket | `chat-images` | [`hooks/useChatImageUrl.ts:27`](../hooks/useChatImageUrl.ts#L27)<br>[`hooks/useMessages.ts:470`](../hooks/useMessages.ts#L470) |
| Storage bucket | `club-avatars` | [`app/(app)/club/[id].tsx:242`](../app/%28app%29/club/%5Bid%5D.tsx#L242) |
| Edge Function | `places-proxy` | [`components/LocationPickerField.tsx:70`](../components/LocationPickerField.tsx#L70) |
| Edge Function | `send-feedback-email` | [`lib/feedback.ts:15`](../lib/feedback.ts#L15) |

</details>

### Shared model index

| Section in `types/index.ts` | Exported types |
|---|---|
| Database Row Types | [`AppDatabase`](../types/index.ts#L18), [`RpcReturns`](../types/index.ts#L23), [`VolleyballPosition`](../types/index.ts#L32), [`VolleyballSkillLevel`](../types/index.ts#L41), [`ProfileBorder`](../types/index.ts#L67), [`Profile`](../types/index.ts#L76), [`NotificationType`](../types/index.ts#L120), [`NotificationPrefType`](../types/index.ts#L123), [`NotificationPrefs`](../types/index.ts#L126), [`NotificationData`](../types/index.ts#L132), [`NotificationItem`](../types/index.ts#L152), [`PushData`](../types/index.ts#L155), [`WebPushState`](../types/index.ts#L164), [`WebPushEnv`](../types/index.ts#L167), [`Notification`](../types/index.ts#L184), [`Event`](../types/index.ts#L204) |
| Share links and previews (#130) | [`EventPreviewRow`](../types/index.ts#L213), [`EventPreviewState`](../types/index.ts#L217), [`EventPreviewMeta`](../types/index.ts#L220), [`Surface`](../types/index.ts#L231), [`CheerType`](../types/index.ts#L234), [`Cheer`](../types/index.ts#L248), [`EventAttendee`](../types/index.ts#L267), [`NoShowColumns`](../types/index.ts#L282), [`SetNoShowArgs`](../types/index.ts#L289), [`NoShowWindow`](../types/index.ts#L292), [`EventAttendeeWithProfile`](../types/index.ts#L300), [`EventAttendeeCountEmbed`](../types/index.ts#L305), [`EventComment`](../types/index.ts#L313), [`MentionUser`](../types/index.ts#L316), [`EventCommentWithAuthor`](../types/index.ts#L323), [`EventEditSource`](../types/index.ts#L328), [`CommentPage`](../types/index.ts#L338), [`EventCommentsPage`](../types/index.ts#L349), [`EventGuest`](../types/index.ts#L355), [`EventGuestPublicRow`](../types/index.ts#L364), [`EventCohost`](../types/index.ts#L370), [`EventCohostWithProfile`](../types/index.ts#L373), [`FeedbackSubmission`](../types/index.ts#L381), [`FeedbackKind`](../types/index.ts#L386), [`FeedbackPriority`](../types/index.ts#L387) |
| Query Response Types | [`EventWithDetails`](../types/index.ts#L401), [`FeedSnapshot`](../types/index.ts#L434), [`QuerySnapshot`](../types/index.ts#L442), [`SessionConfirmation`](../types/index.ts#L450), [`ExternalSession`](../types/index.ts#L453), [`SearchScope`](../types/index.ts#L460), [`SearchHost`](../types/index.ts#L463), [`SearchClub`](../types/index.ts#L466), [`SearchFeedResult`](../types/index.ts#L469), [`SearchHostRowProps`](../types/index.ts#L471), [`SearchClubRowProps`](../types/index.ts#L472), [`SearchResults`](../types/index.ts#L475), [`ProgramDivision`](../types/index.ts#L478), [`ExternalProgram`](../types/index.ts#L481), [`ExternalProgramCardProps`](../types/index.ts#L495), [`SheetTeamsViewProps`](../types/index.ts#L504), [`SheetScoringPanelProps`](../types/index.ts#L507), [`LiveScoresLinkProps`](../types/index.ts#L518), [`ProgramHostChipsProps`](../types/index.ts#L521), [`ProgramSectionProps`](../types/index.ts#L529), [`ProgramsForRegion`](../types/index.ts#L538) |
| Form Types | [`HostRecurrence`](../types/index.ts#L552), [`HostFormParams`](../types/index.ts#L561), [`CreateEventForm`](../types/index.ts#L569), [`Tag`](../types/index.ts#L593), [`UserEventTemplate`](../types/index.ts#L602) |
| Club Types | [`MembershipType`](../types/index.ts#L612), [`MajorCity`](../types/index.ts#L617), [`GameAlertSurface`](../types/index.ts#L621), [`GameAlertTime`](../types/index.ts#L622), [`GameAlertPrefs`](../types/index.ts#L625), [`GameAlertFilterKey`](../types/index.ts#L634), [`UserSettings`](../types/index.ts#L636), [`HiddenFeedKind`](../types/index.ts#L650), [`HiddenFeedEntry`](../types/index.ts#L658), [`HideFeedOption`](../types/index.ts#L666), [`FeedItemShellProps`](../types/index.ts#L672), [`HiddenCountRowProps`](../types/index.ts#L683), [`HideFeedSheetProps`](../types/index.ts#L690), [`HiddenFeedControls`](../types/index.ts#L700), [`UsernameLoginSession`](../types/index.ts#L709), [`ReminderLeadMinutes`](../types/index.ts#L718), [`NotificationSettingRowProps`](../types/index.ts#L721), [`ReminderCopy`](../types/index.ts#L731), [`BannerDef`](../types/index.ts#L738), [`BannerAction`](../types/index.ts#L751) |
| Ads (constants/ads.ts, hooks/useFeedAds.ts, utils/feedAds.ts) | [`AdBanner`](../types/index.ts#L756), [`FeedAds`](../types/index.ts#L759), [`FeedAdPlacement`](../types/index.ts#L765), [`AdFreeStatus`](../types/index.ts#L770), [`AdFreeRedeemResult`](../types/index.ts#L778) |
| Tours (constants/tours.ts, contexts/tour.tsx) | [`TourId`](../types/index.ts#L785), [`TourPlacement`](../types/index.ts#L788), [`TourStepDef`](../types/index.ts#L790), [`TourDef`](../types/index.ts#L801), [`TourSource`](../types/index.ts#L807), [`TourShell`](../types/index.ts#L810), [`TourControls`](../types/index.ts#L818), [`TourRect`](../types/index.ts#L825), [`TourSize`](../types/index.ts#L827), [`TourInsets`](../types/index.ts#L829), [`TourCardPosition`](../types/index.ts#L832), [`TourMeasurable`](../types/index.ts#L835), [`Club`](../types/index.ts#L844), [`ClubMember`](../types/index.ts#L850), [`ClubWithDetails`](../types/index.ts#L856), [`ClubPost`](../types/index.ts#L866), [`ClubPostLike`](../types/index.ts#L871), [`ClubPostComment`](../types/index.ts#L876), [`ClubPostCommentWithAuthor`](../types/index.ts#L879), [`ClubPostWithFeed`](../types/index.ts#L884), [`ClubPollKind`](../types/index.ts#L893), [`ClubPollOption`](../types/index.ts#L896), [`ClubPoll`](../types/index.ts#L905), [`ClubPollOptionTally`](../types/index.ts#L914), [`ClubPollTally`](../types/index.ts#L917), [`ClubPollDraftOption`](../types/index.ts#L920), [`PollBlockProps`](../types/index.ts#L922), [`PollComposerProps`](../types/index.ts#L933) |
| Derived / Computed Types | [`AttendanceStatus`](../types/index.ts#L948), [`TeamAssignment`](../types/index.ts#L963), [`MyEventStatus`](../types/index.ts#L969), [`MyUpcomingEvent`](../types/index.ts#L972) |
| Events Feed Types | [`FeedFilter`](../types/index.ts#L984), [`FeedFilterChip`](../types/index.ts#L986), [`FeedDaySection`](../types/index.ts#L988), [`FeedCardContext`](../types/index.ts#L990), [`EventsFeedDesktopProps`](../types/index.ts#L1027), [`EventsFeedMobileProps`](../types/index.ts#L1039), [`FeedHiding`](../types/index.ts#L1060), [`FeedSectionOptions`](../types/index.ts#L1075), [`SurfaceFilter`](../types/index.ts#L1087), [`SurfaceFilterProps`](../types/index.ts#L1089), [`FeedRsvpAction`](../types/index.ts#L1096), [`FeedRsvpVars`](../types/index.ts#L1098), [`FeedRsvpResult`](../types/index.ts#L1101), [`EventsHeaderProps`](../types/index.ts#L1103), [`FilterChipsProps`](../types/index.ts#L1110), [`FeedEmptyProps`](../types/index.ts#L1118), [`NextUpCardProps`](../types/index.ts#L1128) |
| Chat Types | [`ConversationType`](../types/index.ts#L1135), [`Message`](../types/index.ts#L1138), [`MessageReaction`](../types/index.ts#L1140), [`ConversationRow`](../types/index.ts#L1143), [`ChatSilence`](../types/index.ts#L1173), [`ChatSilenceWithProfile`](../types/index.ts#L1176), [`ProfileBrief`](../types/index.ts#L1187), [`MessageWithDetails`](../types/index.ts#L1189), [`ChatMessageListProps`](../types/index.ts#L1202) |
| Friends (#15) | [`Friend`](../types/index.ts#L1219), [`FriendRequest`](../types/index.ts#L1224), [`FriendsData`](../types/index.ts#L1229), [`FriendStatus`](../types/index.ts#L1236), [`FriendButtonProps`](../types/index.ts#L1239), [`FriendManageSheetProps`](../types/index.ts#L1248), [`FriendRowProps`](../types/index.ts#L1260), [`FriendsGoingLineProps`](../types/index.ts#L1274), [`FriendGoing`](../types/index.ts#L1282) |
| Badge Types | [`CardBgType`](../types/index.ts#L1286), [`BadgeType`](../types/index.ts#L1288), [`UserBadge`](../types/index.ts#L1309), [`BadgeArt`](../types/index.ts#L1315), [`BadgeArtMap`](../types/index.ts#L1318) |
| Tournament Types | [`TournamentStatus`](../types/index.ts#L1322), [`TournamentFormat`](../types/index.ts#L1323), [`TournamentBracketType`](../types/index.ts#L1324), [`TournamentStage`](../types/index.ts#L1325), [`TournamentTeamStatus`](../types/index.ts#L1326), [`TournamentMatchStatus`](../types/index.ts#L1327), [`Tournament`](../types/index.ts#L1329), [`TournamentRules`](../types/index.ts#L1337), [`TournamentTeam`](../types/index.ts#L1339), [`TournamentTeamMember`](../types/index.ts#L1341), [`TournamentPool`](../types/index.ts#L1343), [`TournamentMatch`](../types/index.ts#L1345), [`TournamentSet`](../types/index.ts#L1350), [`TournamentDraft`](../types/index.ts#L1353) |
| Tournament Discussion | [`TournamentComment`](../types/index.ts#L1391), [`TournamentCommentWithAuthor`](../types/index.ts#L1393), [`TournamentCommentsPage`](../types/index.ts#L1399) |
| Tournament Team Management | [`TournamentTeamInvitationStatus`](../types/index.ts#L1403), [`TournamentTeamInvitation`](../types/index.ts#L1404), [`TournamentJoinRequestStatus`](../types/index.ts#L1406), [`TournamentTeamJoinRequest`](../types/index.ts#L1407) |
| Tournament Prizes | [`TournamentPrize`](../types/index.ts#L1411) |
| Tournament Team with roster | [`TournamentTeamWithRoster`](../types/index.ts#L1415) |
| Google Places prediction | [`GooglePlacePrediction`](../types/index.ts#L1429), [`AppConfigRow`](../types/index.ts#L1441), [`UpdateRequirement`](../types/index.ts#L1447) |
| Session | [`SessionState`](../types/index.ts#L1457) |
| UI primitives (components/ui) | [`IoniconName`](../types/index.ts#L1467), [`SpinnerProps`](../types/index.ts#L1470), [`ScreenStateProps`](../types/index.ts#L1475), [`EmptyStateProps`](../types/index.ts#L1493), [`ChipVariant`](../types/index.ts#L1502), [`ChipProps`](../types/index.ts#L1504), [`IconButtonProps`](../types/index.ts#L1517), [`ScreenHeaderProps`](../types/index.ts#L1532), [`ConfirmDialogProps`](../types/index.ts#L1547), [`BottomSheetProps`](../types/index.ts#L1565), [`ScreenContainerProps`](../types/index.ts#L1578) |
| Profile / club / host (Phase B4) | [`ProfilePatch`](../types/index.ts#L1589), [`ToastState`](../types/index.ts#L1593), [`ClubListItem`](../types/index.ts#L1596), [`ClubDetailData`](../types/index.ts#L1603), [`ClubPostsData`](../types/index.ts#L1611), [`OwnedClubOption`](../types/index.ts#L1618) |
| Schedule generator | [`ScheduleConfig`](../types/index.ts#L1630), [`ScheduleInput`](../types/index.ts#L1644), [`SchedulePool`](../types/index.ts#L1665), [`ScheduleMatch`](../types/index.ts#L1673), [`TimedBracketMatch`](../types/index.ts#L1688), [`GeneratedSchedule`](../types/index.ts#L1690) |
| Screen data | [`TournamentCore`](../types/index.ts#L1700), [`TournamentViewer`](../types/index.ts#L1707), [`JoinRequestRequester`](../types/index.ts#L1709), [`TournamentJoinRequestWithRequester`](../types/index.ts#L1711), [`PendingInvite`](../types/index.ts#L1715), [`MyRegistration`](../types/index.ts#L1718), [`TournamentMatchRow`](../types/index.ts#L1726), [`TournamentConfirm`](../types/index.ts#L1736), [`TournamentInviteCandidate`](../types/index.ts#L1743) |
| Event detail hooks (hooks/event) | [`TeamSource`](../types/index.ts#L1747), [`BalancePlayer`](../types/index.ts#L1750), [`TeamSummary`](../types/index.ts#L1752), [`TeamMode`](../types/index.ts#L1754), [`RandomizeResult`](../types/index.ts#L1756), [`PendingCheer`](../types/index.ts#L1761), [`EventCommentPostVars`](../types/index.ts#L1764), [`RemoveDialogState`](../types/index.ts#L1767), [`RemoveDialogAction`](../types/index.ts#L1768), [`ZoneLayout`](../types/index.ts#L1771), [`LazyChunkBoundaryProps`](../types/index.ts#L1774), [`LazyChunkBoundaryState`](../types/index.ts#L1775), [`LegendBorderProps`](../types/index.ts#L1778), [`EventData`](../types/index.ts#L1782), [`EventAttendanceApi`](../types/index.ts#L1783), [`EventCommentsApi`](../types/index.ts#L1784), [`EventPaymentsApi`](../types/index.ts#L1785), [`EventCheersApi`](../types/index.ts#L1786), [`CohostsApi`](../types/index.ts#L1787), [`EventTeamsApi`](../types/index.ts#L1788), [`TeamDragApi`](../types/index.ts#L1789), [`TournamentActions`](../types/index.ts#L1790), [`JoinAction`](../types/index.ts#L1796), [`JoinActionState`](../types/index.ts#L1806), [`SelfAttendanceAction`](../types/index.ts#L1811), [`LeaveConsequencePart`](../types/index.ts#L1821), [`LeaveConsequence`](../types/index.ts#L1827), [`LeaveEventInfo`](../types/index.ts#L1834), [`LeaveRosterInfo`](../types/index.ts#L1839), [`LeaveViewerInfo`](../types/index.ts#L1842), [`LeaveReason`](../types/index.ts#L1845), [`ToastAction`](../types/index.ts#L1848), [`ToastVariant`](../types/index.ts#L1851), [`ToastMessage`](../types/index.ts#L1854), [`RemoveTarget`](../types/index.ts#L1865), [`RosterAction`](../types/index.ts#L1870), [`NoShowRowAction`](../types/index.ts#L1882), [`RosterMenu`](../types/index.ts#L1890), [`RosterActionContext`](../types/index.ts#L1893) |
| Profile hooks | [`MyProfile`](../types/index.ts#L1905), [`AvatarUploader`](../types/index.ts#L1926) |
| Chat hooks / utils | [`SenderProfile`](../types/index.ts#L1943), [`ReplySnapshot`](../types/index.ts#L1944), [`MessageRecord`](../types/index.ts#L1947), [`DebouncedCall`](../types/index.ts#L1949), [`PendingSend`](../types/index.ts#L1959), [`ConversationLookupRow`](../types/index.ts#L1967) |
| Shared component contracts | [`EventCardRsvpHandler`](../types/index.ts#L1983), [`RowEventCardRsvpHandler`](../types/index.ts#L1984), [`TeamCardActions`](../types/index.ts#L1987), [`CheerCounts`](../types/index.ts#L2000), [`AnchorRect`](../types/index.ts#L2003), [`AnchorMenuOption`](../types/index.ts#L2005), [`LocationValue`](../types/index.ts#L2013), [`ClubLocationFields`](../types/index.ts#L2026) |
| Badges, previews, tournament tabs | [`BadgeStats`](../types/index.ts#L2030), [`BadgeAwardPlan`](../types/index.ts#L2045), [`EventCardPreviews`](../types/index.ts#L2051), [`EventCardPreviewRow`](../types/index.ts#L2054), [`FeedSpanRows`](../types/index.ts#L2062), [`StoredFeedFilters`](../types/index.ts#L2070), [`TournamentTabName`](../types/index.ts#L2075) |
| Schelagg court availability and session checks (lib/schelagg, utils/courts) | [`HHMM`](../types/index.ts#L2080), [`HHMMRange`](../types/index.ts#L2083), [`MinuteRange`](../types/index.ts#L2086), [`CourtsCourt`](../types/index.ts#L2088), [`CourtsFacility`](../types/index.ts#L2094), [`CourtsVenue`](../types/index.ts#L2103), [`CourtsError`](../types/index.ts#L2120), [`CourtsResponse`](../types/index.ts#L2123), [`CourtsData`](../types/index.ts#L2133), [`AustinNow`](../types/index.ts#L2136), [`CourtLane`](../types/index.ts#L2138), [`FacilityDay`](../types/index.ts#L2147), [`DayOption`](../types/index.ts#L2166), [`SessionCheckStatus`](../types/index.ts#L2168), [`SessionCheckResult`](../types/index.ts#L2171), [`SessionLinkDecision`](../types/index.ts#L2192), [`SessionLinkNotice`](../types/index.ts#L2207), [`CreateMenuSectionKey`](../types/index.ts#L2211) |
| Usage metrics (lib/analytics.ts) | [`AnalyticsEventName`](../types/index.ts#L2215), [`AnalyticsProps`](../types/index.ts#L2218) |
| Legal pages (/terms, /privacy) | [`LegalSpan`](../types/index.ts#L2223), [`LegalBlock`](../types/index.ts#L2226), [`VenmoLinks`](../types/index.ts#L2234) |
| Text size (#43) | [`TextSizeId`](../types/index.ts#L2244), [`TextSizeOption`](../types/index.ts#L2246), [`TextScaleContextValue`](../types/index.ts#L2253) |
| Account deletion (#99) | [`AccountDeletionSuccessor`](../types/index.ts#L2266), [`AccountDeletionPlan`](../types/index.ts#L2272), [`AccountDeletionBlock`](../types/index.ts#L2288), [`WebScrollableRef`](../types/index.ts#L2290) |
| Weather on outdoor games (#165) | [`ForecastHour`](../types/index.ts#L2295), [`Forecast`](../types/index.ts#L2312), [`ForecastWindow`](../types/index.ts#L2319), [`ForecastCell`](../types/index.ts#L2322), [`ForecastTone`](../types/index.ts#L2325), [`ForecastSummary`](../types/index.ts#L2328), [`ForecastCourt`](../types/index.ts#L2343) |
| Public profile, history, cheers summary (#185) | [`UserProfileData`](../types/index.ts#L2348), [`EventHistoryKind`](../types/index.ts#L2357), [`CheersReceived`](../types/index.ts#L2360), [`CheersSummary`](../types/index.ts#L2366), [`RecoveryLink`](../types/index.ts#L2374) |
| Join intent (#229) | [`PendingAction`](../types/index.ts#L2384), [`PendingActionTake`](../types/index.ts#L2387), [`JoinOffer`](../types/index.ts#L2390), [`JoinIntentOutcome`](../types/index.ts#L2393) |
| View state in the URL (utils/urlState, hooks/useUrlParam) | [`UrlCodec`](../types/index.ts#L2398), [`FeedbackFieldErrors`](../types/index.ts#L2404), [`ReportReason`](../types/index.ts#L2407), [`ReportContextKind`](../types/index.ts#L2408), [`ReportStatus`](../types/index.ts#L2409), [`ReportAction`](../types/index.ts#L2410), [`ReportUserInput`](../types/index.ts#L2412), [`AdminReport`](../types/index.ts#L2421), [`ReportSheetTarget`](../types/index.ts#L2440), [`ReportSheetProps`](../types/index.ts#L2443), [`EventSeed`](../types/index.ts#L2459), [`MemberSearchResult`](../types/index.ts#L2471) |
| What to bring (#256) | [`BringClaimer`](../types/index.ts#L2477), [`BringItem`](../types/index.ts#L2487), [`BringItemDraft`](../types/index.ts#L2498), [`BringItemAction`](../types/index.ts#L2508), [`BringViewer`](../types/index.ts#L2517), [`SaveBringItemsArgs`](../types/index.ts#L2525), [`ClaimBringItemArgs`](../types/index.ts#L2529), [`ReleaseBringItemArgs`](../types/index.ts#L2530), [`StartupConfig`](../types/index.ts#L2533), [`StartupArm`](../types/index.ts#L2540), [`MyGameRecap`](../types/index.ts#L2543), [`YourGameCardProps`](../types/index.ts#L2545), [`RecapFooterProps`](../types/index.ts#L2554), [`RecapShareTarget`](../types/index.ts#L2565) |
| Events calendar (components/events/CalendarPagers.tsx, utils/calendarWeeks.ts, #217) | [`MarkedDates`](../types/index.ts#L2569), [`WeekStripContentProps`](../types/index.ts#L2571), [`MonthGridContentProps`](../types/index.ts#L2580), [`WeekPagerProps`](../types/index.ts#L2589) |

### Constrained string values

The codebase uses string-literal unions and `as const` arrays instead of the
TypeScript `enum` keyword.

| Type or field | Values | Source |
|---|---|---|
| `AccountDeletionBlock` | `reauth_required`, `plan_changed` | [`types/index.ts:2288`](../types/index.ts#L2288) |
| `BadgeStat` | `events_attended_past`, `events_hosted_past`, `cheers_received_total`, `cheers_given_events`, `spike_cheers`, `serve_cheers`, `block_cheers`, `set_cheers`, `dig_pass_cheers`, `communication_cheers`, `beta_active`, `tournament_hosted`, `profile_complete`, `vex_member` | [`constants/badges.ts:43`](../constants/badges.ts#L43) |
| `BadgeType` | `event_attendee`, `event_host`, `cheers_received`, `cheers_given`, `spike_cheer`, `serve_cheer`, `block_cheer`, `set_cheer`, `dig_pass_cheer`, `communication_cheer`, `beta_tester`, `tournament_director`, `profile_complete`, `vex_spirit` | [`types/index.ts:1288`](../types/index.ts#L1288) |
| `CardBgType` | `ember`, `frost`, `aurora` | [`types/index.ts:1286`](../types/index.ts#L1286) |
| `CheerType` | `spike`, `block`, `serve`, `dig`, `set`, `pass`, `communication` | [`types/index.ts:234`](../types/index.ts#L234) |
| `ChipProps.role` | `button`, `radio` | [`types/index.ts:1511`](../types/index.ts#L1511) |
| `ChipProps.size` | `default`, `touch` | [`types/index.ts:1513`](../types/index.ts#L1513) |
| `ChipVariant` | `solid`, `tint` | [`types/index.ts:1502`](../types/index.ts#L1502) |
| `ClubPollKind` | `text`, `time` | [`types/index.ts:893`](../types/index.ts#L893) |
| `ConversationType` | `dm`, `club` | [`types/index.ts:1135`](../types/index.ts#L1135) |
| `CreateMenuSectionKey` | `vteam`, `venue` | [`types/index.ts:2211`](../types/index.ts#L2211) |
| `EventCardRsvpHandler` | `join`, `leave` | [`types/index.ts:1983`](../types/index.ts#L1983) |
| `EventHistoryKind` | `attended`, `hosted-past`, `hosted-upcoming` | [`types/index.ts:2357`](../types/index.ts#L2357) |
| `EventPreviewState` | `upcoming`, `cancelled`, `ended`, `missing` | [`types/index.ts:217`](../types/index.ts#L217) |
| `FeedbackKind` | `feature`, `bug` | [`types/index.ts:386`](../types/index.ts#L386) |
| `FeedbackPriority` | `low`, `medium`, `high` | [`types/index.ts:387`](../types/index.ts#L387) |
| `FeedFilter` | `all`, `open_play`, `tournament` | [`types/index.ts:984`](../types/index.ts#L984) |
| `FeedRsvpAction` | `join`, `leave` | [`types/index.ts:1096`](../types/index.ts#L1096) |
| `ForecastTone` | `neutral`, `rain`, `heat` | [`types/index.ts:2325`](../types/index.ts#L2325) |
| `ForecastWindow` | `show`, `later` | [`types/index.ts:2319`](../types/index.ts#L2319) |
| `FriendsGoingLineProps.tone` | `onDark`, `onCard` | [`types/index.ts:1277`](../types/index.ts#L1277) |
| `FriendStatus` | `none`, `requested`, `incoming`, `friends` | [`types/index.ts:1236`](../types/index.ts#L1236) |
| `GameAlertFilterKey` | `surfaces`, `levels`, `times` | [`types/index.ts:634`](../types/index.ts#L634) |
| `GameAlertSurface` | `indoor`, `sand`, `grass` | [`types/index.ts:621`](../types/index.ts#L621) |
| `GameAlertTime` | `weekday_evening`, `weekday_day`, `weekend` | [`types/index.ts:622`](../types/index.ts#L622) |
| `HiddenFeedKind` | `item`, `venue`, `host`, `type` | [`types/index.ts:650`](../types/index.ts#L650) |
| `JoinAction` | `leave`, `leave-waitlist`, `cancel-request`, `rerequest`, `waitlist`, `request`, `join` | [`types/index.ts:1796`](../types/index.ts#L1796) |
| `JoinIntentOutcome` | `joined`, `not_now`, `skipped`, `expired` | [`types/index.ts:2393`](../types/index.ts#L2393) |
| `JoinOffer` | `join`, `waitlist`, `request` | [`types/index.ts:2390`](../types/index.ts#L2390) |
| `LeaveConsequence.kind` | `waitlist`, `full`, `open`, `approval`, `hostNotified`, `paid`, `points` | [`types/index.ts:1828`](../types/index.ts#L1828) |
| `LeaveReason` | `something_came_up`, `sick`, `injured`, `work` | [`types/index.ts:1845`](../types/index.ts#L1845) |
| `MembershipType` | `open`, `invite` | [`types/index.ts:612`](../types/index.ts#L612) |
| `Message` | `messages`, `mentions` | [`types/index.ts:1138`](../types/index.ts#L1138) |
| `MyEventStatus` | `hosting`, `attending`, `waitlisted`, `requested` | [`types/index.ts:969`](../types/index.ts#L969) |
| `NOTIFICATION_TYPES / NotificationType` | `tournament_team_invite`, `tournament_join_request`, `tournament_join_accepted`, `tournament_join_declined`, `tournament_free_agent_assigned`, `tournament_mention`, `chat_mention`, `report_resolved`, `moderation_warning` | [`types/index.ts:107`](../types/index.ts#L107) |
| `ProfileBorder` | `bronze`, `gold`, `gradient`, `storm`, `aether` | [`types/index.ts:67`](../types/index.ts#L67) |
| `RecapShareTarget` | `native`, `web-share`, `download` | [`types/index.ts:2565`](../types/index.ts#L2565) |
| `RecoveryLink` | `recovery`, `expired` | [`types/index.ts:2374`](../types/index.ts#L2374) |
| `RecurrenceCadence` | `weekly`, `biweekly`, `monthly` | [`constants/events.ts:90`](../constants/events.ts#L90) |
| `ReportAction` | `dismiss`, `warn`, `suspend` | [`types/index.ts:2410`](../types/index.ts#L2410) |
| `ReportContextKind` | `profile`, `dm`, `message`, `event_comment`, `club_post` | [`types/index.ts:2408`](../types/index.ts#L2408) |
| `ReportReason` | `harassment`, `hate`, `spam`, `unsafe_play`, `fake_profile`, `other` | [`types/index.ts:2407`](../types/index.ts#L2407) |
| `ReportStatus` | `open`, `dismissed`, `warned`, `suspended` | [`types/index.ts:2409`](../types/index.ts#L2409) |
| `RosterAction.key` | `message`, `message-adder`, `profile`, `no-show`, `remove` | [`types/index.ts:1871`](../types/index.ts#L1871) |
| `ScheduleMatch.stage` | `pool_play`, `bracket`, `round_robin` | [`types/index.ts:1675`](../types/index.ts#L1675) |
| `SearchScope` | `upcoming`, `mine_past` | [`types/index.ts:460`](../types/index.ts#L460) |
| `SelfAttendanceAction` | `join`, `leave`, `joinWaitlist`, `leaveWaitlist`, `requestToJoin`, `cancelRequest`, `rerequest` | [`types/index.ts:1811`](../types/index.ts#L1811) |
| `SessionCheckStatus` | `scheduled`, `canceled`, `changed`, `gone`, `unknown` | [`types/index.ts:2168`](../types/index.ts#L2168) |
| `StartupArm` | `cdn`, `direct` | [`types/index.ts:2540`](../types/index.ts#L2540) |
| `Surface` | `indoor`, `sand`, `grass` | [`types/index.ts:231`](../types/index.ts#L231) |
| `TeamMode` | `random`, `balanced` | [`types/index.ts:1754`](../types/index.ts#L1754) |
| `TextSizeId` | `small`, `default`, `large`, `xlarge` | [`types/index.ts:2244`](../types/index.ts#L2244) |
| `ToastVariant` | `error`, `warning`, `success`, `info` | [`types/index.ts:1851`](../types/index.ts#L1851) |
| `TourId` | `intro`, `scorekeeper`, `scorekeeperExample` | [`types/index.ts:785`](../types/index.ts#L785) |
| `TournamentBracketType` | `single`, `double` | [`types/index.ts:1324`](../types/index.ts#L1324) |
| `TournamentFormat` | `pool_play`, `bracket`, `pool_bracket`, `round_robin` | [`types/index.ts:1323`](../types/index.ts#L1323) |
| `TournamentJoinRequestStatus` | `pending`, `approved`, `declined` | [`types/index.ts:1406`](../types/index.ts#L1406) |
| `TournamentMatchStatus` | `scheduled`, `in_progress`, `completed`, `forfeit` | [`types/index.ts:1327`](../types/index.ts#L1327) |
| `TournamentStage` | `pool_play`, `bracket`, `round_robin` | [`types/index.ts:1325`](../types/index.ts#L1325) |
| `TournamentStatus` | `draft`, `published`, `in_progress`, `completed`, `cancelled` | [`types/index.ts:1322`](../types/index.ts#L1322) |
| `TournamentTeamInvitationStatus` | `pending`, `accepted`, `declined` | [`types/index.ts:1403`](../types/index.ts#L1403) |
| `TournamentTeamStatus` | `registered`, `waitlisted`, `free_agent`, `disqualified` | [`types/index.ts:1326`](../types/index.ts#L1326) |
| `TourPlacement` | `auto`, `top`, `bottom` | [`types/index.ts:788`](../types/index.ts#L788) |
| `TourSource` | `banner`, `profile_menu`, `first_use`, `help_button`, `other` | [`types/index.ts:807`](../types/index.ts#L807) |
| `VolleyballPosition` | `setter`, `libero`, `outside_hitter`, `defensive_specialist`, `opposite_hitter`, `middle_blocker` | [`types/index.ts:32`](../types/index.ts#L32) |
| `WebPushEnv.permission` | `default`, `granted`, `denied` | [`types/index.ts:174`](../types/index.ts#L174) |
| `WebPushState` | `unsupported`, `needs-install`, `ask`, `on`, `blocked` | [`types/index.ts:164`](../types/index.ts#L164) |
<!-- END GENERATED: code-inventory -->

## Storage contracts

| Bucket | Visibility/use | Database representation |
|---|---|---|
| `avatars` | The active client treats profile photos as public and constructs public object/render URLs | `profiles.avatar_url` normally stores an object path; legacy HTTPS URLs are also accepted |
| `club-avatars` | Club avatar/cover uploads | `clubs.avatar_url` or `clubs.cover_url` stores the object path |
| `chat-images` | Public message images | `messages.image_url` stores the generated public URL |
| `badges` | Public badge artwork referenced by constants | Full public URLs are embedded in badge definitions |

Bucket names are centralized in
[`constants/storage.ts`](../constants/storage.ts). Active avatar URL resolution
is in [`utils/index.ts:284`](../utils/index.ts#L284).

## Known contract gaps to resolve before schema work

These are repository observations, not assumptions about the current live
database:

1. The repository itself says checked-in migrations are not synchronized with
   applied production history ([`CONTRIBUTING.md:150`](../CONTRIBUTING.md#L150)).
   Do not replay this folder as a complete schema or infer that an absent SQL
   definition is absent in production.
2. The notification migration constrains `kudos_received` and says clients do
   not insert inbox rows
   ([`supabase/migrations/20260402120000_notifications_inbox.sql:12`](../supabase/migrations/20260402120000_notifications_inbox.sql#L12)),
   while the current TypeScript enum uses `cheers_received` and current client
   paths directly insert several notification types
   ([`types/index.ts:51`](../types/index.ts#L51),
   [`app/(app)/event/[id].tsx:627`](../app/%28app%29/event/%5Bid%5D.tsx#L627)).
   The live constraint/policies must be inspected before editing this contract.
3. Event create/edit writes `latitude` and `longitude`, but the base `Event`
   type does not declare them
   ([`app/(app)/host.tsx:278`](../app/%28app%29/host.tsx#L278),
   [`types/index.ts:102`](../types/index.ts#L102)).
4. Current tournament code reads and writes fields/tables such as
   `venmo_handle`, scheduling columns, `is_approved`, comments, prizes,
   invitations, and join requests that are not all represented in the one
   checked-in tournament migration
   ([`types/index.ts:578`](../types/index.ts#L578),
   [`supabase/migrations/20260423120000_tournaments.sql:3`](../supabase/migrations/20260423120000_tournaments.sql#L3)).
5. Avatar privacy comments and implementation disagree. `types/index.ts` and
   `constants/storage.ts` describe a private bucket and signed URL lifetime,
   but the active resolver and splash prefetch build `/object/public` and
   `/render/image/public` URLs; there is no `createSignedUrl` call
   ([`types/index.ts:33`](../types/index.ts#L33),
   [`constants/storage.ts:7`](../constants/storage.ts#L7),
   [`utils/index.ts:290`](../utils/index.ts#L290),
   [`app/_layout.tsx:32`](../app/_layout.tsx#L32)). Confirm the live bucket's
   intended privacy before changing uploads or URL handling.
6. Because response types are handwritten and many queries are embedded in
   screens, changing a column or relationship requires checking the query
   projection, its cast, the shared type, the rendered consumers, RLS, and old
   installed native clients together.

For future contract changes, the safest order is: inspect the live schema and
policies; add backward-compatible database fields/functions; update shared
types and centralized projections; update consumers; then attach test evidence
covering the final request/response path.
