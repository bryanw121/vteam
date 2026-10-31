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
  /** Generated badge art (useBadgeArt): a fixed catalog that changes only when an admin regenerates a tier. */
  badgeArt: 60 * 60_000,
  /** Event tags (host form, feed filters): a near-static lookup table. */
  tags: 10 * 60_000,
  /** get_my_conversations (Chat list, chat tab badge, chat room header); realtime patches it in between. */
  conversations: 30_000,
  /** Court availability from Schelagg (Book a court). Its API caches 60s, so refetching sooner gains nothing. */
  courts: 60_000,
  /** Curated reference lists that change only by migration (major_cities). */
  reference: 60 * 60_000,
} as const
