/**
 * Staleness windows (ms): how long fetched data is considered fresh before a
 * focus / remount triggers a refetch. Explicit user actions (pull-to-refresh,
 * a mutation that invalidates the data) always bypass these.
 */
export const STALE = {
  /** Event feed, per month bucket (useMonthEvents). Also the default for list screens. */
  feed: 60_000,
  /** In-app notifications list (useNotifications). */
  notifications: 45_000,
  /** Earned badges and the badge-award check (useBadges). They change rarely and are written server-side. */
  badges: 10 * 60_000,
  /** A single event / tournament page being re-focused (event/[id], tournament/[id] teams). */
  detail: 30_000,
  /** A user profile (own or someone else's): the `fetchProfile` pattern from CLAUDE.md. */
  profile: 60_000,
  /** My friends and pending friend requests (useFriends), and friends going to feed events. */
  friends: 2 * 60_000,
  /** Event tags (host form, feed filters): a near-static lookup table. */
  tags: 10 * 60_000,
  /** get_my_conversations (Chat list, chat tab badge, chat room header); realtime patches it in between. */
  conversations: 30_000,
  /** Court availability from Schelagg (Book a court). Its API caches 60s, so refetching sooner gains nothing. */
  courts: 60_000,
  /** NWS hourly forecast per court (useForecast). The proxy's CDN copy is fresh for 30 min too. */
  forecast: 30 * 60_000,
  /** Outside leagues and tournaments (useExternalPrograms): Schelagg refreshes them twice a day. */
  programs: 30 * 60_000,
  /** Whether the viewer is an admin (Profile's Admin metrics row). Changes only by hand in app_admins. */
  adminCheck: 30 * 60_000,
  /** Admin metrics screens (Overview, People, Retention, one person): computed on demand, a minute is fresh enough. */
  metrics: 60_000,
  /** Metrics → Live: refetched every 15 s while on screen. */
  metricsLive: 10_000,
  /** Curated reference lists that change only by migration (major_cities). */
  reference: 60 * 60_000,
} as const
