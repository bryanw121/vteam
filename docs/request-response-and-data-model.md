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
> Inventory fingerprint: `181a54eeb2a7`

This inventory is generated from the repository's TypeScript and SQL. It is the
fast lookup layer; the surrounding prose explains intent and relationships.

### Direct table and view calls

<details>
<summary>54 tables/views referenced by code</summary>

| Table or view | Frontend/server call sites |
|---|---|
| `ad_banners` | [`hooks/useFeedAds.ts:18`](../hooks/useFeedAds.ts#L18) |
| `app_admins` | [`supabase/functions/generate-badge-art/index.ts:82`](../supabase/functions/generate-badge-art/index.ts#L82) |
| `app_config` | [`hooks/useMinVersion.ts:19`](../hooks/useMinVersion.ts#L19) |
| `app_events` | [`lib/analytics.ts:159`](../lib/analytics.ts#L159) |
| `badge_art` | [`hooks/useBadgeArt.ts:26`](../hooks/useBadgeArt.ts#L26)<br>[`supabase/functions/generate-badge-art/index.ts:130`](../supabase/functions/generate-badge-art/index.ts#L130) |
| `chat_silences` | [`hooks/useSilencedUsers.ts:27`](../hooks/useSilencedUsers.ts#L27)<br>[`supabase/functions/send-chat-push/handler.ts:142`](../supabase/functions/send-chat-push/handler.ts#L142) |
| `cheers` | [`hooks/event/useEventCheers.ts:16`](../hooks/event/useEventCheers.ts#L16)<br>[`hooks/useCheersSummary.ts:12`](../hooks/useCheersSummary.ts#L12)<br>[`hooks/useMyProfile.ts:72`](../hooks/useMyProfile.ts#L72)<br>[`hooks/useUserProfile.ts:21`](../hooks/useUserProfile.ts#L21)<br>[`utils/badges.ts:41`](../utils/badges.ts#L41) |
| `club_members` | [`app/(app)/(tabs)/(main)/clubs.tsx:87`](../app/%28app%29/%28tabs%29/%28main%29/clubs.tsx#L87)<br>[`app/(app)/chat/[id].tsx:94`](../app/%28app%29/chat/%5Bid%5D.tsx#L94)<br>[`app/(app)/club/[id].tsx:132`](../app/%28app%29/club/%5Bid%5D.tsx#L132)<br>[`app/(app)/host.tsx:174`](../app/%28app%29/host.tsx#L174)<br>[`app/(app)/tournament/create.tsx:774`](../app/%28app%29/tournament/create.tsx#L774) |
| `club_post_comments` | [`components/ClubPostCard.tsx:91`](../components/ClubPostCard.tsx#L91) |
| `club_post_likes` | [`components/ClubPostCard.tsx:63`](../components/ClubPostCard.tsx#L63) |
| `club_posts` | [`components/ClubPostCard.tsx:257`](../components/ClubPostCard.tsx#L257)<br>[`hooks/useClub.ts:71`](../hooks/useClub.ts#L71) |
| `clubs` | [`app/(app)/(tabs)/(main)/clubs.tsx:224`](../app/%28app%29/%28tabs%29/%28main%29/clubs.tsx#L224)<br>[`app/(app)/club/[id].tsx:188`](../app/%28app%29/club/%5Bid%5D.tsx#L188)<br>[`app/(app)/club/create.tsx:65`](../app/%28app%29/club/create.tsx#L65)<br>[`hooks/useClub.ts:53`](../hooks/useClub.ts#L53) |
| `conversation_members` | [`supabase/functions/send-chat-push/handler.ts:126`](../supabase/functions/send-chat-push/handler.ts#L126) |
| `conversations` | [`hooks/useConversations.ts:276`](../hooks/useConversations.ts#L276)<br>[`supabase/functions/send-chat-push/handler.ts:125`](../supabase/functions/send-chat-push/handler.ts#L125) |
| `event_attendee_denials` | [`hooks/event/useMyDenialReason.ts:8`](../hooks/event/useMyDenialReason.ts#L8) |
| `event_attendees` | [`app/(app)/host.tsx:446`](../app/%28app%29/host.tsx#L446)<br>[`hooks/event/useEventAttendance.ts:110`](../hooks/event/useEventAttendance.ts#L110)<br>[`hooks/event/useEventTeams.ts:92`](../hooks/event/useEventTeams.ts#L92)<br>[`hooks/useMonthEvents.ts:610`](../hooks/useMonthEvents.ts#L610)<br>[`hooks/useMyUpcomingEvents.ts:100`](../hooks/useMyUpcomingEvents.ts#L100)<br>[`utils/badges.ts:25`](../utils/badges.ts#L25) |
| `event_cohosts` | [`hooks/event/useCohosts.ts:54`](../hooks/event/useCohosts.ts#L54)<br>[`hooks/event/useEventData.ts:62`](../hooks/event/useEventData.ts#L62) |
| `event_comments` | [`hooks/event/useEventComments.ts:41`](../hooks/event/useEventComments.ts#L41)<br>[`hooks/event/useEventData.ts:82`](../hooks/event/useEventData.ts#L82) |
| `event_guests` | [`hooks/event/useEventAttendance.ts:336`](../hooks/event/useEventAttendance.ts#L336)<br>[`hooks/event/useEventData.ts:52`](../hooks/event/useEventData.ts#L52)<br>[`hooks/event/useEventTeams.ts:103`](../hooks/event/useEventTeams.ts#L103) |
| `event_guests_attending` | [`hooks/event/useEventData.ts:44`](../hooks/event/useEventData.ts#L44) |
| `event_payments` | [`hooks/event/useEventPayments.ts:13`](../hooks/event/useEventPayments.ts#L13) |
| `event_tags` | [`app/(app)/host.tsx:410`](../app/%28app%29/host.tsx#L410) |
| `events` | [`app/(app)/host.tsx:195`](../app/%28app%29/host.tsx#L195)<br>[`components/event/EventDetailScreen.tsx:271`](../components/event/EventDetailScreen.tsx#L271)<br>[`hooks/event/useEventData.ts:31`](../hooks/event/useEventData.ts#L31)<br>[`hooks/useClub.ts:45`](../hooks/useClub.ts#L45)<br>[`hooks/useEventHistory.ts:18`](../hooks/useEventHistory.ts#L18)<br>[`hooks/useForecast.ts:78`](../hooks/useForecast.ts#L78)<br>+3 more files |
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
| `profiles` | [`app/(auth)/register.tsx:69`](../app/%28auth%29/register.tsx#L69)<br>[`hooks/event/useEventData.ts:110`](../hooks/event/useEventData.ts#L110)<br>[`hooks/tournament/api.ts:193`](../hooks/tournament/api.ts#L193)<br>[`hooks/useMessages.ts:68`](../hooks/useMessages.ts#L68)<br>[`hooks/useMyProfile.ts:112`](../hooks/useMyProfile.ts#L112)<br>[`hooks/useUserProfile.ts:20`](../hooks/useUserProfile.ts#L20)<br>+4 more files |
| `push_receipts` | [`supabase/functions/check-push-receipts/handler.ts:42`](../supabase/functions/check-push-receipts/handler.ts#L42)<br>[`supabase/functions/send-chat-push/handler.ts:206`](../supabase/functions/send-chat-push/handler.ts#L206)<br>[`supabase/functions/send-notification-push/handler.ts:150`](../supabase/functions/send-notification-push/handler.ts#L150) |
| `push_tokens` | [`supabase/functions/check-push-receipts/handler.ts:87`](../supabase/functions/check-push-receipts/handler.ts#L87)<br>[`supabase/functions/send-chat-push/handler.ts:151`](../supabase/functions/send-chat-push/handler.ts#L151)<br>[`supabase/functions/send-notification-push/handler.ts:104`](../supabase/functions/send-notification-push/handler.ts#L104)<br>[`utils/pushNotifications.ts:111`](../utils/pushNotifications.ts#L111) |
| `rate_limits` | [`supabase/functions/login-with-username/handler.ts:67`](../supabase/functions/login-with-username/handler.ts#L67) |
| `sponsored_events` | [`hooks/useFeedAds.ts:19`](../hooks/useFeedAds.ts#L19) |
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
| `tournament_trophies` | [`hooks/tournament/api.ts:456`](../hooks/tournament/api.ts#L456) |
| `tournaments` | [`app/(app)/tournament/create.tsx:704`](../app/%28app%29/tournament/create.tsx#L704)<br>[`hooks/tournament/api.ts:112`](../hooks/tournament/api.ts#L112)<br>[`hooks/useMonthEvents.ts:275`](../hooks/useMonthEvents.ts#L275)<br>[`hooks/useTournamentList.ts:22`](../hooks/useTournamentList.ts#L22) |
| `user_badges` | [`hooks/useBadges.ts:53`](../hooks/useBadges.ts#L53)<br>[`hooks/useUserProfile.ts:22`](../hooks/useUserProfile.ts#L22)<br>[`utils/badges.ts:186`](../utils/badges.ts#L186) |
| `user_event_templates` | [`app/(app)/host.tsx:221`](../app/%28app%29/host.tsx#L221) |
| `user_settings` | [`hooks/useHiddenFeed.ts:28`](../hooks/useHiddenFeed.ts#L28)<br>[`hooks/useMyProfile.ts:127`](../hooks/useMyProfile.ts#L127)<br>[`hooks/useUserSettings.ts:24`](../hooks/useUserSettings.ts#L24)<br>[`supabase/functions/send-notification-push/handler.ts:102`](../supabase/functions/send-notification-push/handler.ts#L102) |

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
| `complete_tournament` | [`hooks/tournament/api.ts:446`](../hooks/tournament/api.ts#L446) | [`supabase/migrations/20261028205312_tournament_trophies.sql:67`](../supabase/migrations/20261028205312_tournament_trophies.sql#L67) |
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
| `mark_all_notifications_read` | [`hooks/useNotifications.ts:106`](../hooks/useNotifications.ts#L106) | [`supabase/migrations/20260402120000_notifications_inbox.sql:112`](../supabase/migrations/20260402120000_notifications_inbox.sql#L112) |
| `mark_conversation_read` | [`hooks/useConversations.ts:118`](../hooks/useConversations.ts#L118) | Not checked in |
| `mark_notification_read` | [`hooks/useNotifications.ts:93`](../hooks/useNotifications.ts#L93) | [`supabase/migrations/20260402120000_notifications_inbox.sql:98`](../supabase/migrations/20260402120000_notifications_inbox.sql#L98) |
| `redeem_ad_free` | [`hooks/useAdFree.ts:43`](../hooks/useAdFree.ts#L43) | [`supabase/migrations/20261028170200_ad_free_redeem.sql:64`](../supabase/migrations/20261028170200_ad_free_redeem.sql#L64) |
| `release_bring_item` | [`hooks/event/useEventBringList.ts:67`](../hooks/event/useEventBringList.ts#L67) | [`supabase/migrations/20261112190000_event_bring_items.sql:277`](../supabase/migrations/20261112190000_event_bring_items.sql#L277) |
| `remove_friend` | [`hooks/useFriends.ts:73`](../hooks/useFriends.ts#L73) | [`supabase/migrations/20261028203837_friends.sql:294`](../supabase/migrations/20261028203837_friends.sql#L294) |
| `replace_tournament_schedule` | [`hooks/tournament/api.ts:362`](../hooks/tournament/api.ts#L362) | [`supabase/migrations/20261025120000_tournament_rpcs.sql:100`](../supabase/migrations/20261025120000_tournament_rpcs.sql#L100) |
| `report_user` | [`hooks/useReportUser.ts:13`](../hooks/useReportUser.ts#L13) | [`supabase/migrations/20261113010000_user_reports.sql:51`](../supabase/migrations/20261113010000_user_reports.sql#L51) |
| `respond_friend_request` | [`hooks/useFriends.ts:72`](../hooks/useFriends.ts#L72) | [`supabase/migrations/20261028203837_friends.sql:216`](../supabase/migrations/20261028203837_friends.sql#L216) |
| `save_event_bring_items` | [`app/(app)/host.tsx:310`](../app/%28app%29/host.tsx#L310) | [`supabase/migrations/20261112190000_event_bring_items.sql:112`](../supabase/migrations/20261112190000_event_bring_items.sql#L112) |
| `search_feed` | [`hooks/useSearch.ts:25`](../hooks/useSearch.ts#L25) | [`supabase/migrations/20261113150000_search_feed.sql:40`](../supabase/migrations/20261113150000_search_feed.sql#L40) |
| `search_members` | [`lib/memberSearch.ts:19`](../lib/memberSearch.ts#L19) | [`supabase/migrations/20261028140000_rate_limits.sql:101`](../supabase/migrations/20261028140000_rate_limits.sql#L101) |
| `send_friend_request` | [`hooks/useFriends.ts:70`](../hooks/useFriends.ts#L70) | [`supabase/migrations/20261028203837_friends.sql:144`](../supabase/migrations/20261028203837_friends.sql#L144) |
| `set_best_friend` | [`hooks/useFriends.ts:74`](../hooks/useFriends.ts#L74) | [`supabase/migrations/20261028203837_friends.sql:318`](../supabase/migrations/20261028203837_friends.sql#L318) |
| `set_no_show` | [`hooks/event/useEventAttendance.ts:305`](../hooks/event/useEventAttendance.ts#L305) | [`supabase/migrations/20261104190000_event_no_show.sql:60`](../supabase/migrations/20261104190000_event_no_show.sql#L60) |

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
| Auth | `signOut` | [`app/(app)/(tabs)/settings/account.tsx:52`](../app/%28app%29/%28tabs%29/settings/account.tsx#L52)<br>[`app/(auth)/reset-password.tsx:67`](../app/%28auth%29/reset-password.tsx#L67)<br>[`hooks/useAccountDeletion.ts:63`](../hooks/useAccountDeletion.ts#L63) |
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
| Storage bucket | `club-avatars` | [`app/(app)/club/[id].tsx:207`](../app/%28app%29/club/%5Bid%5D.tsx#L207) |
| Edge Function | `places-proxy` | [`components/LocationPickerField.tsx:70`](../components/LocationPickerField.tsx#L70) |
| Edge Function | `send-feedback-email` | [`lib/feedback.ts:15`](../lib/feedback.ts#L15) |

</details>

### Shared model index

| Section in `types/index.ts` | Exported types |
|---|---|
| Database Row Types | [`AppDatabase`](../types/index.ts#L17), [`RpcReturns`](../types/index.ts#L22), [`VolleyballPosition`](../types/index.ts#L31), [`VolleyballSkillLevel`](../types/index.ts#L40), [`ProfileBorder`](../types/index.ts#L66), [`Profile`](../types/index.ts#L75), [`NotificationType`](../types/index.ts#L117), [`NotificationPrefType`](../types/index.ts#L120), [`NotificationPrefs`](../types/index.ts#L123), [`NotificationData`](../types/index.ts#L129), [`NotificationItem`](../types/index.ts#L149), [`PushData`](../types/index.ts#L152), [`Notification`](../types/index.ts#L163), [`Event`](../types/index.ts#L183) |
| Share links and previews (#130) | [`EventPreviewRow`](../types/index.ts#L192), [`EventPreviewState`](../types/index.ts#L196), [`EventPreviewMeta`](../types/index.ts#L199), [`Surface`](../types/index.ts#L210), [`CheerType`](../types/index.ts#L213), [`Cheer`](../types/index.ts#L227), [`EventAttendee`](../types/index.ts#L246), [`NoShowColumns`](../types/index.ts#L261), [`SetNoShowArgs`](../types/index.ts#L268), [`NoShowWindow`](../types/index.ts#L271), [`EventAttendeeWithProfile`](../types/index.ts#L279), [`EventAttendeeCountEmbed`](../types/index.ts#L284), [`EventComment`](../types/index.ts#L292), [`MentionUser`](../types/index.ts#L295), [`EventCommentWithAuthor`](../types/index.ts#L302), [`EventEditSource`](../types/index.ts#L307), [`CommentPage`](../types/index.ts#L317), [`EventCommentsPage`](../types/index.ts#L328), [`EventGuest`](../types/index.ts#L334), [`EventGuestPublicRow`](../types/index.ts#L343), [`EventCohost`](../types/index.ts#L349), [`EventCohostWithProfile`](../types/index.ts#L352), [`FeedbackSubmission`](../types/index.ts#L360), [`FeedbackKind`](../types/index.ts#L365), [`FeedbackPriority`](../types/index.ts#L366) |
| Query Response Types | [`EventWithDetails`](../types/index.ts#L380), [`FeedSnapshot`](../types/index.ts#L413), [`QuerySnapshot`](../types/index.ts#L421), [`SessionConfirmation`](../types/index.ts#L429), [`ExternalSession`](../types/index.ts#L432), [`SearchScope`](../types/index.ts#L439), [`SearchHost`](../types/index.ts#L442), [`SearchClub`](../types/index.ts#L445), [`SearchFeedResult`](../types/index.ts#L448), [`SearchHostRowProps`](../types/index.ts#L450), [`SearchClubRowProps`](../types/index.ts#L451), [`SearchResults`](../types/index.ts#L454), [`ProgramDivision`](../types/index.ts#L457), [`ExternalProgram`](../types/index.ts#L460), [`ExternalProgramCardProps`](../types/index.ts#L474), [`SheetTeamsViewProps`](../types/index.ts#L483), [`SheetScoringPanelProps`](../types/index.ts#L486), [`LiveScoresLinkProps`](../types/index.ts#L497), [`ProgramHostChipsProps`](../types/index.ts#L500), [`ProgramSectionProps`](../types/index.ts#L508), [`ProgramsForRegion`](../types/index.ts#L517) |
| Form Types | [`CreateEventForm`](../types/index.ts#L530), [`Tag`](../types/index.ts#L554), [`UserEventTemplate`](../types/index.ts#L563) |
| Club Types | [`MembershipType`](../types/index.ts#L573), [`MajorCity`](../types/index.ts#L578), [`UserSettings`](../types/index.ts#L581), [`HiddenFeedKind`](../types/index.ts#L593), [`HiddenFeedEntry`](../types/index.ts#L601), [`HideFeedOption`](../types/index.ts#L609), [`FeedItemShellProps`](../types/index.ts#L615), [`HiddenCountRowProps`](../types/index.ts#L626), [`HideFeedSheetProps`](../types/index.ts#L633), [`HiddenFeedControls`](../types/index.ts#L643), [`UsernameLoginSession`](../types/index.ts#L652), [`ReminderLeadMinutes`](../types/index.ts#L661), [`NotificationSettingRowProps`](../types/index.ts#L664), [`ReminderCopy`](../types/index.ts#L674), [`BannerDef`](../types/index.ts#L681), [`BannerAction`](../types/index.ts#L694) |
| Ads (constants/ads.ts, hooks/useFeedAds.ts, utils/feedAds.ts) | [`AdBanner`](../types/index.ts#L699), [`FeedAds`](../types/index.ts#L702), [`FeedAdPlacement`](../types/index.ts#L708), [`AdFreeStatus`](../types/index.ts#L713), [`AdFreeRedeemResult`](../types/index.ts#L721) |
| Tours (constants/tours.ts, contexts/tour.tsx) | [`TourId`](../types/index.ts#L728), [`TourPlacement`](../types/index.ts#L731), [`TourStepDef`](../types/index.ts#L733), [`TourDef`](../types/index.ts#L744), [`TourSource`](../types/index.ts#L750), [`TourShell`](../types/index.ts#L753), [`TourControls`](../types/index.ts#L761), [`TourRect`](../types/index.ts#L768), [`TourSize`](../types/index.ts#L770), [`TourInsets`](../types/index.ts#L772), [`TourCardPosition`](../types/index.ts#L775), [`TourMeasurable`](../types/index.ts#L778), [`Club`](../types/index.ts#L787), [`ClubMember`](../types/index.ts#L793), [`ClubWithDetails`](../types/index.ts#L799), [`ClubPost`](../types/index.ts#L809), [`ClubPostLike`](../types/index.ts#L814), [`ClubPostComment`](../types/index.ts#L819), [`ClubPostCommentWithAuthor`](../types/index.ts#L822), [`ClubPostWithFeed`](../types/index.ts#L827) |
| Derived / Computed Types | [`AttendanceStatus`](../types/index.ts#L841), [`TeamAssignment`](../types/index.ts#L856), [`MyEventStatus`](../types/index.ts#L862), [`MyUpcomingEvent`](../types/index.ts#L865) |
| Events Feed Types | [`FeedFilter`](../types/index.ts#L877), [`FeedFilterChip`](../types/index.ts#L879), [`SurfaceFilter`](../types/index.ts#L882), [`SurfaceFilterProps`](../types/index.ts#L884), [`FeedRsvpAction`](../types/index.ts#L891), [`FeedRsvpVars`](../types/index.ts#L893), [`FeedRsvpResult`](../types/index.ts#L896), [`EventsHeaderProps`](../types/index.ts#L898), [`FilterChipsProps`](../types/index.ts#L905), [`FeedEmptyProps`](../types/index.ts#L913), [`NextUpCardProps`](../types/index.ts#L923) |
| Chat Types | [`ConversationType`](../types/index.ts#L930), [`Message`](../types/index.ts#L933), [`MessageReaction`](../types/index.ts#L935), [`ConversationRow`](../types/index.ts#L938), [`ChatSilence`](../types/index.ts#L968), [`ChatSilenceWithProfile`](../types/index.ts#L971), [`ProfileBrief`](../types/index.ts#L982), [`MessageWithDetails`](../types/index.ts#L984), [`ChatMessageListProps`](../types/index.ts#L997) |
| Friends (#15) | [`Friend`](../types/index.ts#L1014), [`FriendRequest`](../types/index.ts#L1019), [`FriendsData`](../types/index.ts#L1024), [`FriendStatus`](../types/index.ts#L1031), [`FriendButtonProps`](../types/index.ts#L1034), [`FriendManageSheetProps`](../types/index.ts#L1043), [`FriendRowProps`](../types/index.ts#L1055), [`FriendsGoingLineProps`](../types/index.ts#L1069), [`FriendGoing`](../types/index.ts#L1077) |
| Badge Types | [`CardBgType`](../types/index.ts#L1081), [`BadgeType`](../types/index.ts#L1083), [`UserBadge`](../types/index.ts#L1104), [`BadgeArt`](../types/index.ts#L1110), [`BadgeArtMap`](../types/index.ts#L1113) |
| Tournament Types | [`TournamentStatus`](../types/index.ts#L1117), [`TournamentFormat`](../types/index.ts#L1118), [`TournamentBracketType`](../types/index.ts#L1119), [`TournamentStage`](../types/index.ts#L1120), [`TournamentTeamStatus`](../types/index.ts#L1121), [`TournamentMatchStatus`](../types/index.ts#L1122), [`Tournament`](../types/index.ts#L1124), [`TournamentRules`](../types/index.ts#L1132), [`TournamentTeam`](../types/index.ts#L1134), [`TournamentTeamMember`](../types/index.ts#L1136), [`TournamentPool`](../types/index.ts#L1138), [`TournamentMatch`](../types/index.ts#L1140), [`TournamentSet`](../types/index.ts#L1145), [`TournamentDraft`](../types/index.ts#L1148) |
| Tournament Discussion | [`TournamentComment`](../types/index.ts#L1186), [`TournamentCommentWithAuthor`](../types/index.ts#L1188), [`TournamentCommentsPage`](../types/index.ts#L1194) |
| Tournament Team Management | [`TournamentTeamInvitationStatus`](../types/index.ts#L1198), [`TournamentTeamInvitation`](../types/index.ts#L1199), [`TournamentJoinRequestStatus`](../types/index.ts#L1201), [`TournamentTeamJoinRequest`](../types/index.ts#L1202) |
| Tournament Prizes | [`TournamentPrize`](../types/index.ts#L1206) |
| Tournament Team with roster | [`TournamentTeamWithRoster`](../types/index.ts#L1210) |
| Google Places prediction | [`GooglePlacePrediction`](../types/index.ts#L1224), [`AppConfigRow`](../types/index.ts#L1236), [`UpdateRequirement`](../types/index.ts#L1242) |
| Session | [`SessionState`](../types/index.ts#L1252) |
| UI primitives (components/ui) | [`IoniconName`](../types/index.ts#L1262), [`SpinnerProps`](../types/index.ts#L1265), [`ScreenStateProps`](../types/index.ts#L1270), [`EmptyStateProps`](../types/index.ts#L1288), [`ChipVariant`](../types/index.ts#L1297), [`ChipProps`](../types/index.ts#L1299), [`IconButtonProps`](../types/index.ts#L1312), [`ScreenHeaderProps`](../types/index.ts#L1327), [`ConfirmDialogProps`](../types/index.ts#L1342), [`BottomSheetProps`](../types/index.ts#L1360), [`ScreenContainerProps`](../types/index.ts#L1373) |
| Profile / club / host (Phase B4) | [`ProfilePatch`](../types/index.ts#L1384), [`ToastState`](../types/index.ts#L1388), [`ClubListItem`](../types/index.ts#L1391), [`ClubDetailData`](../types/index.ts#L1398), [`ClubPostsData`](../types/index.ts#L1406), [`OwnedClubOption`](../types/index.ts#L1413) |
| Schedule generator | [`ScheduleConfig`](../types/index.ts#L1424), [`ScheduleInput`](../types/index.ts#L1438), [`SchedulePool`](../types/index.ts#L1459), [`ScheduleMatch`](../types/index.ts#L1467), [`TimedBracketMatch`](../types/index.ts#L1482), [`GeneratedSchedule`](../types/index.ts#L1484) |
| Screen data | [`TournamentCore`](../types/index.ts#L1494), [`TournamentViewer`](../types/index.ts#L1501), [`JoinRequestRequester`](../types/index.ts#L1503), [`TournamentJoinRequestWithRequester`](../types/index.ts#L1505), [`PendingInvite`](../types/index.ts#L1509), [`MyRegistration`](../types/index.ts#L1512), [`TournamentMatchRow`](../types/index.ts#L1520), [`TournamentConfirm`](../types/index.ts#L1530), [`TournamentInviteCandidate`](../types/index.ts#L1537) |
| Event detail hooks (hooks/event) | [`TeamSource`](../types/index.ts#L1541), [`BalancePlayer`](../types/index.ts#L1544), [`TeamSummary`](../types/index.ts#L1546), [`TeamMode`](../types/index.ts#L1548), [`RandomizeResult`](../types/index.ts#L1550), [`PendingCheer`](../types/index.ts#L1555), [`EventCommentPostVars`](../types/index.ts#L1558), [`RemoveDialogState`](../types/index.ts#L1561), [`RemoveDialogAction`](../types/index.ts#L1562), [`ZoneLayout`](../types/index.ts#L1565), [`LazyChunkBoundaryProps`](../types/index.ts#L1568), [`LazyChunkBoundaryState`](../types/index.ts#L1569), [`LegendBorderProps`](../types/index.ts#L1572), [`EventData`](../types/index.ts#L1576), [`EventAttendanceApi`](../types/index.ts#L1577), [`EventCommentsApi`](../types/index.ts#L1578), [`EventPaymentsApi`](../types/index.ts#L1579), [`EventCheersApi`](../types/index.ts#L1580), [`CohostsApi`](../types/index.ts#L1581), [`EventTeamsApi`](../types/index.ts#L1582), [`TeamDragApi`](../types/index.ts#L1583), [`TournamentActions`](../types/index.ts#L1584), [`JoinAction`](../types/index.ts#L1590), [`JoinActionState`](../types/index.ts#L1600), [`SelfAttendanceAction`](../types/index.ts#L1605), [`LeaveConsequencePart`](../types/index.ts#L1615), [`LeaveConsequence`](../types/index.ts#L1621), [`LeaveEventInfo`](../types/index.ts#L1628), [`LeaveRosterInfo`](../types/index.ts#L1633), [`LeaveViewerInfo`](../types/index.ts#L1636), [`LeaveReason`](../types/index.ts#L1639), [`ToastAction`](../types/index.ts#L1642), [`ToastVariant`](../types/index.ts#L1645), [`ToastMessage`](../types/index.ts#L1648), [`RemoveTarget`](../types/index.ts#L1659), [`RosterAction`](../types/index.ts#L1664), [`NoShowRowAction`](../types/index.ts#L1676), [`RosterMenu`](../types/index.ts#L1684), [`RosterActionContext`](../types/index.ts#L1687) |
| Profile hooks | [`MyProfile`](../types/index.ts#L1699), [`AvatarUploader`](../types/index.ts#L1720) |
| Chat hooks / utils | [`SenderProfile`](../types/index.ts#L1737), [`ReplySnapshot`](../types/index.ts#L1738), [`MessageRecord`](../types/index.ts#L1741), [`DebouncedCall`](../types/index.ts#L1743), [`PendingSend`](../types/index.ts#L1753), [`ConversationLookupRow`](../types/index.ts#L1761) |
| Shared component contracts | [`EventCardRsvpHandler`](../types/index.ts#L1777), [`RowEventCardRsvpHandler`](../types/index.ts#L1778), [`TeamCardActions`](../types/index.ts#L1781), [`CheerCounts`](../types/index.ts#L1794), [`AnchorRect`](../types/index.ts#L1797), [`AnchorMenuOption`](../types/index.ts#L1799), [`LocationValue`](../types/index.ts#L1807), [`ClubLocationFields`](../types/index.ts#L1820) |
| Badges, previews, tournament tabs | [`BadgeStats`](../types/index.ts#L1824), [`BadgeAwardPlan`](../types/index.ts#L1839), [`EventCardPreviews`](../types/index.ts#L1845), [`EventCardPreviewRow`](../types/index.ts#L1848), [`FeedSpanRows`](../types/index.ts#L1856), [`StoredFeedFilters`](../types/index.ts#L1864), [`TournamentTabName`](../types/index.ts#L1869) |
| Schelagg court availability and session checks (lib/schelagg, utils/courts) | [`HHMM`](../types/index.ts#L1874), [`HHMMRange`](../types/index.ts#L1877), [`MinuteRange`](../types/index.ts#L1880), [`CourtsCourt`](../types/index.ts#L1882), [`CourtsFacility`](../types/index.ts#L1888), [`CourtsVenue`](../types/index.ts#L1897), [`CourtsError`](../types/index.ts#L1914), [`CourtsResponse`](../types/index.ts#L1917), [`CourtsData`](../types/index.ts#L1927), [`AustinNow`](../types/index.ts#L1930), [`CourtLane`](../types/index.ts#L1932), [`FacilityDay`](../types/index.ts#L1941), [`DayOption`](../types/index.ts#L1960), [`SessionCheckStatus`](../types/index.ts#L1962), [`SessionCheckResult`](../types/index.ts#L1965), [`SessionLinkDecision`](../types/index.ts#L1986), [`SessionLinkNotice`](../types/index.ts#L2001), [`CreateMenuSectionKey`](../types/index.ts#L2005) |
| Usage metrics (lib/analytics.ts) | [`AnalyticsEventName`](../types/index.ts#L2009), [`AnalyticsProps`](../types/index.ts#L2012) |
| Legal pages (/terms, /privacy) | [`LegalSpan`](../types/index.ts#L2017), [`LegalBlock`](../types/index.ts#L2020), [`VenmoLinks`](../types/index.ts#L2028) |
| Text size (#43) | [`TextSizeId`](../types/index.ts#L2038), [`TextSizeOption`](../types/index.ts#L2040), [`TextScaleContextValue`](../types/index.ts#L2047) |
| Account deletion (#99) | [`AccountDeletionSuccessor`](../types/index.ts#L2060), [`AccountDeletionPlan`](../types/index.ts#L2066), [`AccountDeletionBlock`](../types/index.ts#L2082), [`WebScrollableRef`](../types/index.ts#L2084) |
| Weather on outdoor games (#165) | [`ForecastHour`](../types/index.ts#L2089), [`Forecast`](../types/index.ts#L2106), [`ForecastWindow`](../types/index.ts#L2113), [`ForecastCell`](../types/index.ts#L2116), [`ForecastTone`](../types/index.ts#L2119), [`ForecastSummary`](../types/index.ts#L2122), [`ForecastCourt`](../types/index.ts#L2137) |
| Public profile, history, cheers summary (#185) | [`UserProfileData`](../types/index.ts#L2142), [`EventHistoryKind`](../types/index.ts#L2151), [`CheersReceived`](../types/index.ts#L2154), [`CheersSummary`](../types/index.ts#L2160), [`RecoveryLink`](../types/index.ts#L2168) |
| Join intent (#229) | [`PendingAction`](../types/index.ts#L2178), [`PendingActionTake`](../types/index.ts#L2181), [`JoinOffer`](../types/index.ts#L2184), [`JoinIntentOutcome`](../types/index.ts#L2187) |
| View state in the URL (utils/urlState, hooks/useUrlParam) | [`UrlCodec`](../types/index.ts#L2192), [`FeedbackFieldErrors`](../types/index.ts#L2198), [`ReportReason`](../types/index.ts#L2201), [`ReportContextKind`](../types/index.ts#L2202), [`ReportStatus`](../types/index.ts#L2203), [`ReportAction`](../types/index.ts#L2204), [`ReportUserInput`](../types/index.ts#L2206), [`AdminReport`](../types/index.ts#L2215), [`ReportSheetTarget`](../types/index.ts#L2234), [`ReportSheetProps`](../types/index.ts#L2237), [`EventSeed`](../types/index.ts#L2253), [`MemberSearchResult`](../types/index.ts#L2265) |
| What to bring (#256) | [`BringClaimer`](../types/index.ts#L2271), [`BringItem`](../types/index.ts#L2281), [`BringItemDraft`](../types/index.ts#L2292), [`BringItemAction`](../types/index.ts#L2302), [`BringViewer`](../types/index.ts#L2311), [`SaveBringItemsArgs`](../types/index.ts#L2319), [`ClaimBringItemArgs`](../types/index.ts#L2323), [`ReleaseBringItemArgs`](../types/index.ts#L2324) |

### Constrained string values

The codebase uses string-literal unions and `as const` arrays instead of the
TypeScript `enum` keyword.

| Type or field | Values | Source |
|---|---|---|
| `AccountDeletionBlock` | `reauth_required`, `plan_changed` | [`types/index.ts:2082`](../types/index.ts#L2082) |
| `BadgeStat` | `events_attended_past`, `events_hosted_past`, `cheers_received_total`, `cheers_given_events`, `spike_cheers`, `serve_cheers`, `block_cheers`, `set_cheers`, `dig_pass_cheers`, `communication_cheers`, `beta_active`, `tournament_hosted`, `profile_complete`, `vex_member` | [`constants/badges.ts:43`](../constants/badges.ts#L43) |
| `BadgeType` | `event_attendee`, `event_host`, `cheers_received`, `cheers_given`, `spike_cheer`, `serve_cheer`, `block_cheer`, `set_cheer`, `dig_pass_cheer`, `communication_cheer`, `beta_tester`, `tournament_director`, `profile_complete`, `vex_spirit` | [`types/index.ts:1083`](../types/index.ts#L1083) |
| `CardBgType` | `ember`, `frost`, `aurora` | [`types/index.ts:1081`](../types/index.ts#L1081) |
| `CheerType` | `spike`, `block`, `serve`, `dig`, `set`, `pass`, `communication` | [`types/index.ts:213`](../types/index.ts#L213) |
| `ChipProps.role` | `button`, `radio` | [`types/index.ts:1306`](../types/index.ts#L1306) |
| `ChipProps.size` | `default`, `touch` | [`types/index.ts:1308`](../types/index.ts#L1308) |
| `ChipVariant` | `solid`, `tint` | [`types/index.ts:1297`](../types/index.ts#L1297) |
| `ConversationType` | `dm`, `club` | [`types/index.ts:930`](../types/index.ts#L930) |
| `CreateMenuSectionKey` | `vteam`, `venue` | [`types/index.ts:2005`](../types/index.ts#L2005) |
| `EventCardRsvpHandler` | `join`, `leave` | [`types/index.ts:1777`](../types/index.ts#L1777) |
| `EventHistoryKind` | `attended`, `hosted-past`, `hosted-upcoming` | [`types/index.ts:2151`](../types/index.ts#L2151) |
| `EventPreviewState` | `upcoming`, `cancelled`, `ended`, `missing` | [`types/index.ts:196`](../types/index.ts#L196) |
| `FeedbackKind` | `feature`, `bug` | [`types/index.ts:365`](../types/index.ts#L365) |
| `FeedbackPriority` | `low`, `medium`, `high` | [`types/index.ts:366`](../types/index.ts#L366) |
| `FeedFilter` | `all`, `open_play`, `tournament` | [`types/index.ts:877`](../types/index.ts#L877) |
| `FeedRsvpAction` | `join`, `leave` | [`types/index.ts:891`](../types/index.ts#L891) |
| `ForecastTone` | `neutral`, `rain`, `heat` | [`types/index.ts:2119`](../types/index.ts#L2119) |
| `ForecastWindow` | `show`, `later` | [`types/index.ts:2113`](../types/index.ts#L2113) |
| `FriendsGoingLineProps.tone` | `onDark`, `onCard` | [`types/index.ts:1072`](../types/index.ts#L1072) |
| `FriendStatus` | `none`, `requested`, `incoming`, `friends` | [`types/index.ts:1031`](../types/index.ts#L1031) |
| `HiddenFeedKind` | `item`, `venue`, `host`, `type` | [`types/index.ts:593`](../types/index.ts#L593) |
| `JoinAction` | `leave`, `leave-waitlist`, `cancel-request`, `rerequest`, `waitlist`, `request`, `join` | [`types/index.ts:1590`](../types/index.ts#L1590) |
| `JoinIntentOutcome` | `joined`, `not_now`, `skipped`, `expired` | [`types/index.ts:2187`](../types/index.ts#L2187) |
| `JoinOffer` | `join`, `waitlist`, `request` | [`types/index.ts:2184`](../types/index.ts#L2184) |
| `LeaveConsequence.kind` | `waitlist`, `full`, `open`, `approval`, `hostNotified`, `paid`, `points` | [`types/index.ts:1622`](../types/index.ts#L1622) |
| `LeaveReason` | `something_came_up`, `sick`, `injured`, `work` | [`types/index.ts:1639`](../types/index.ts#L1639) |
| `MembershipType` | `open`, `invite` | [`types/index.ts:573`](../types/index.ts#L573) |
| `Message` | `messages`, `mentions` | [`types/index.ts:933`](../types/index.ts#L933) |
| `MyEventStatus` | `hosting`, `attending`, `waitlisted`, `requested` | [`types/index.ts:862`](../types/index.ts#L862) |
| `NOTIFICATION_TYPES / NotificationType` | `tournament_team_invite`, `tournament_join_request`, `tournament_join_accepted`, `tournament_join_declined`, `tournament_free_agent_assigned`, `tournament_mention`, `chat_mention`, `report_resolved`, `moderation_warning` | [`types/index.ts:104`](../types/index.ts#L104) |
| `ProfileBorder` | `bronze`, `gold`, `gradient`, `storm`, `aether` | [`types/index.ts:66`](../types/index.ts#L66) |
| `RecoveryLink` | `recovery`, `expired` | [`types/index.ts:2168`](../types/index.ts#L2168) |
| `RecurrenceCadence` | `weekly`, `biweekly`, `monthly` | [`constants/events.ts:90`](../constants/events.ts#L90) |
| `ReportAction` | `dismiss`, `warn`, `suspend` | [`types/index.ts:2204`](../types/index.ts#L2204) |
| `ReportContextKind` | `profile`, `dm`, `message`, `event_comment`, `club_post` | [`types/index.ts:2202`](../types/index.ts#L2202) |
| `ReportReason` | `harassment`, `hate`, `spam`, `unsafe_play`, `fake_profile`, `other` | [`types/index.ts:2201`](../types/index.ts#L2201) |
| `ReportStatus` | `open`, `dismissed`, `warned`, `suspended` | [`types/index.ts:2203`](../types/index.ts#L2203) |
| `RosterAction.key` | `message`, `message-adder`, `profile`, `no-show`, `remove` | [`types/index.ts:1665`](../types/index.ts#L1665) |
| `ScheduleMatch.stage` | `pool_play`, `bracket`, `round_robin` | [`types/index.ts:1469`](../types/index.ts#L1469) |
| `SearchScope` | `upcoming`, `mine_past` | [`types/index.ts:439`](../types/index.ts#L439) |
| `SelfAttendanceAction` | `join`, `leave`, `joinWaitlist`, `leaveWaitlist`, `requestToJoin`, `cancelRequest`, `rerequest` | [`types/index.ts:1605`](../types/index.ts#L1605) |
| `SessionCheckStatus` | `scheduled`, `canceled`, `changed`, `gone`, `unknown` | [`types/index.ts:1962`](../types/index.ts#L1962) |
| `Surface` | `indoor`, `sand`, `grass` | [`types/index.ts:210`](../types/index.ts#L210) |
| `TeamMode` | `random`, `balanced` | [`types/index.ts:1548`](../types/index.ts#L1548) |
| `TextSizeId` | `small`, `default`, `large`, `xlarge` | [`types/index.ts:2038`](../types/index.ts#L2038) |
| `ToastVariant` | `error`, `warning`, `success`, `info` | [`types/index.ts:1645`](../types/index.ts#L1645) |
| `TourId` | `intro`, `scorekeeper`, `scorekeeperExample` | [`types/index.ts:728`](../types/index.ts#L728) |
| `TournamentBracketType` | `single`, `double` | [`types/index.ts:1119`](../types/index.ts#L1119) |
| `TournamentFormat` | `pool_play`, `bracket`, `pool_bracket`, `round_robin` | [`types/index.ts:1118`](../types/index.ts#L1118) |
| `TournamentJoinRequestStatus` | `pending`, `approved`, `declined` | [`types/index.ts:1201`](../types/index.ts#L1201) |
| `TournamentMatchStatus` | `scheduled`, `in_progress`, `completed`, `forfeit` | [`types/index.ts:1122`](../types/index.ts#L1122) |
| `TournamentStage` | `pool_play`, `bracket`, `round_robin` | [`types/index.ts:1120`](../types/index.ts#L1120) |
| `TournamentStatus` | `draft`, `published`, `in_progress`, `completed`, `cancelled` | [`types/index.ts:1117`](../types/index.ts#L1117) |
| `TournamentTeamInvitationStatus` | `pending`, `accepted`, `declined` | [`types/index.ts:1198`](../types/index.ts#L1198) |
| `TournamentTeamStatus` | `registered`, `waitlisted`, `free_agent`, `disqualified` | [`types/index.ts:1121`](../types/index.ts#L1121) |
| `TourPlacement` | `auto`, `top`, `bottom` | [`types/index.ts:731`](../types/index.ts#L731) |
| `TourSource` | `banner`, `profile_menu`, `first_use`, `help_button`, `other` | [`types/index.ts:750`](../types/index.ts#L750) |
| `VolleyballPosition` | `setter`, `libero`, `outside_hitter`, `defensive_specialist`, `opposite_hitter`, `middle_blocker` | [`types/index.ts:31`](../types/index.ts#L31) |
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
