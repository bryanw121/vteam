/**
 * Admin usage metrics (Profile → Admin metrics). Shapes of the jsonb the admin_* functions
 * return (supabase/migrations/20261111120000_admin_metrics.sql); the generated types only say
 * `Json`, so hooks cast to these.
 */

export type MetricsTab = 'overview' | 'live' | 'people' | 'retention' | 'reports'

export type MetricsRangeDays = 7 | 30 | 90

export type MetricsPlatform = 'ios' | 'android' | 'web'

export type MetricsDay = {
  day: string
  active: number
  peak: number | null
  peak_at: string | null
}

export type MetricsScreenCount = { screen: string; views: number; people: number }

export type MetricsOverview = {
  from: string
  to: string
  online: { now: number; signed_in: number; guests: number }
  dau_avg: number | null
  dau_avg_prev: number | null
  wau: number
  wau_prev: number
  mau: number
  accounts: number
  signups: number
  signups_from_guests: number
  sessions: number
  median_session_s: number | null
  daily: MetricsDay[]
  platforms: Partial<Record<MetricsPlatform, number>>
  versions: { newest: string | null; behind: number }
  top_screens: MetricsScreenCount[]
  actions: {
    rsvps: number
    hosted: number
    messages: number
    kudos: number
    friend_requests: number
    clubs_joined: number
    outside_links: number
  }
  funnel: { feed: number; event: number; rsvp: number }
}

export type MetricsPersonBrief = {
  user_id: string
  username: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
}

export type OnlinePerson = MetricsPersonBrief & {
  screen: string | null
  platform: MetricsPlatform
  app_version: string | null
  started_at: string
}

export type OnlineNow = {
  at: string
  online: number
  signed_in: number
  guests: number
  by_platform: Partial<Record<MetricsPlatform, number>>
  by_screen: { screen: string; people: number }[]
  last_hour: { at: string; online: number }[]
  today_peak: { peak: number; at: string } | null
  people: OnlinePerson[]
  guest_screens: string[]
  guest_platforms: MetricsPlatform[]
}

export type RetentionCohort = {
  week: string
  size: number
  w1: number | null
  w2: number | null
  w4: number | null
  w8: number | null
}

export type RetentionReport = {
  cohorts: RetentionCohort[]
  guest_devices: number
  guest_converted: number
}

export type AdminUserSort = 'last_seen' | 'active' | 'newest'

export type AdminUserRow = {
  id: string
  username: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  created_at: string | null
  last_seen: string | null
  online: boolean
  platform: MetricsPlatform | null
  app_version: string | null
  sessions_30d: number
  old_build: boolean
}

export type AdminUsersPage = {
  total: number
  active_30d: number
  rows: AdminUserRow[]
}

export type AdminSession = {
  id: string
  started_at: string
  last_seen: string
  platform: MetricsPlatform
  app_version: string | null
  screens: string[]
}

export type AdminUserActivity = {
  id: string
  username: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  created_at: string | null
  first_seen_as_guest: string | null
  platforms: MetricsPlatform[]
  last_seen: string | null
  online: boolean
  screen: string | null
  platform: MetricsPlatform | null
  app_version: string | null
  sessions_30d: number
  median_session_s: number | null
  days: { day: string; minutes: number }[]
  rsvps: number
  hosted: number
  kudos_given: number
  recent: AdminSession[]
}

/** admin_metrics_events: what the part-3 client events add to Overview. */
export type MetricsEvents = {
  from: string
  to: string
  outside_links: {
    taps: number
    people: number
    by_kind: Partial<Record<'session' | 'league' | 'tournament' | 'court' | 'unknown', number>>
    top_orgs: { org: string; taps: number; people: number }[]
  }
  shares: { taps: number; people: number; by_method: Partial<Record<'share_sheet' | 'web_share' | 'copy_link' | 'unknown', number>> }
  filters: { filter: string; surface: string; times: number; people: number }[]
  scorekeeper: { started: number; finished: number; people: number }
  guest_funnel: { guests: number; signed_in: number; rsvped: number }
}
