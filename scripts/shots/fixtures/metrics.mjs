/**
 * Admin usage metrics (Profile → Admin metrics) for the mocked captures: the signed-in viewer is
 * an admin here, and the admin_* RPCs answer this sample data. Deterministic for a given "now",
 * so before and after captures match. Never real people: the fixture players from people.mjs.
 */
import { PEOPLE } from './people.mjs'
import { TIME_ZONE } from './time.mjs'

const MIN = 60_000
const DAY = 86_400_000

const dayKey = ms => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
const iso = ms => new Date(ms).toISOString()
const person = p => ({ username: p.username, first_name: p.first_name, last_name: p.last_name, avatar_url: null })

// A month of daily active people with a Saturday bump; peaks follow it.
const ACTIVE = [9, 11, 8, 10, 12, 14, 17, 10, 9, 12, 11, 13, 15, 18, 11, 10, 13, 12, 14, 16, 19, 12, 11, 14, 13, 15, 17, 20, 13, 14]
const PEAK = [4, 5, 3, 4, 6, 7, 9, 4, 3, 5, 5, 6, 7, 10, 5, 4, 6, 5, 7, 8, 11, 5, 5, 7, 6, 7, 9, 12, 6, 6]

const SCREENS = ['/event/[id]', '/', '/chat', '/', '/event/[id]', '/clubs']
const PLATFORMS = ['ios', 'web', 'ios', 'android', 'ios', 'web', 'ios', 'ios', 'web', 'android', 'ios', 'web', 'ios', 'ios', 'web', 'ios']

export function metricsRpc(now) {
  const nowMs = new Date(now ?? Date.now()).getTime()

  const overview = ({ p_from, p_to }) => {
    const toMs = Date.parse(`${p_to}T12:00:00Z`)
    const fromMs = Date.parse(`${p_from}T12:00:00Z`)
    const days = Math.round((toMs - fromMs) / DAY) + 1
    const daily = Array.from({ length: days }, (_, i) => {
      const k = ACTIVE.length - days + i
      const ms = nowMs - (days - 1 - i) * DAY
      const active = ACTIVE[((k % ACTIVE.length) + ACTIVE.length) % ACTIVE.length]
      const peak = PEAK[((k % PEAK.length) + PEAK.length) % PEAK.length]
      return { day: dayKey(ms), active, peak, peak_at: iso(ms - 3 * 60 * MIN) }
    })
    const avg = Math.round((daily.reduce((n, d) => n + d.active, 0) / days) * 10) / 10
    return {
      from: p_from, to: p_to,
      online: { now: 6, signed_in: 4, guests: 2 },
      dau_avg: avg, dau_avg_prev: Math.round((avg - 2.1) * 10) / 10,
      wau: 24, wau_prev: 19, mau: 31, accounts: 34,
      signups: Math.min(7, days), signups_from_guests: 3,
      sessions: Math.round(avg * days * 1.8), median_session_s: 400,
      daily,
      platforms: { ios: 16, web: 11, android: 4 },
      versions: { newest: '1.6.0', behind: 2 },
      top_screens: [
        { screen: '/', views: 1284, people: 29 },
        { screen: '/event/[id]', views: 742, people: 22 },
        { screen: '/chat', views: 512, people: 17 },
        { screen: '/profile', views: 301, people: 21 },
        { screen: '/tournaments', views: 164, people: 12 },
      ],
      actions: { rsvps: 96, hosted: 14, messages: 388, kudos: 57, friend_requests: 12, clubs_joined: 5, outside_links: 41 },
      funnel: { feed: 29, event: 22, rsvp: 15 },
    }
  }

  const online = () => {
    const people = PEOPLE.slice(0, 4).map((p, i) => ({
      user_id: p.id, ...person(p), screen: SCREENS[i], platform: PLATFORMS[i],
      app_version: PLATFORMS[i] === 'web' ? null : i === 3 ? '1.5.2' : '1.6.0',
      started_at: iso(nowMs - [24, 12, 7, 3][i] * MIN),
    }))
    const hour = [3, 3, 2, 4, 5, 4, 4, 6, 7, 6, 5, 5, 6, 7, 8, 7, 6, 6, 5, 6, 7, 6, 6, 5, 6, 7, 6, 6, 6, 6]
    return {
      at: iso(nowMs - 8000), online: 6, signed_in: 4, guests: 2,
      by_platform: { ios: 3, web: 2, android: 1 },
      by_screen: [{ screen: '/', people: 3 }, { screen: '/event/[id]', people: 2 }, { screen: '/chat', people: 1 }],
      last_hour: hour.map((n, i) => ({ at: iso(nowMs - (hour.length - 1 - i) * 2 * MIN), online: n })),
      today_peak: { peak: 9, at: iso(nowMs - 2 * 60 * MIN) },
      people,
      guest_screens: ['/', '/event/[id]'], guest_platforms: ['web'],
    }
  }

  const retention = () => ({
    cohorts: [
      { week: '2026-09-14', size: 6, w1: 5, w2: 4, w4: 3, w8: 3 },
      { week: '2026-09-21', size: 4, w1: 3, w2: 2, w4: 2, w8: 1 },
      { week: '2026-10-05', size: 5, w1: 4, w2: 3, w4: 2, w8: null },
      { week: '2026-10-19', size: 3, w1: 2, w2: 1, w4: 1, w8: null },
      { week: '2026-10-26', size: 4, w1: 2, w2: 2, w4: null, w8: null },
      { week: '2026-11-02', size: 5, w1: 3, w2: null, w4: null, w8: null },
    ],
    guest_devices: 134, guest_converted: 12,
  })

  const lastSeenAgo = [0.2, 0.5, 1, 2, 120, 1500, 4400, null]
  const users = ({ p_search, p_sort, p_limit }) => {
    const q = (p_search ?? '').toLowerCase()
    let rows = PEOPLE.map((p, i) => {
      const ago = lastSeenAgo[i] === undefined ? (i * 900) : lastSeenAgo[i]
      const platform = ago === null ? null : PLATFORMS[i]
      return {
        id: p.id, ...person(p), created_at: iso(nowMs - (200 - p.i * 7) * DAY),
        last_seen: ago === null ? null : iso(nowMs - ago * MIN),
        online: ago !== null && ago < 1.5,
        platform, app_version: platform && platform !== 'web' ? (i === 6 ? '1.4.3' : i === 3 ? '1.5.2' : '1.6.0') : null,
        sessions_30d: ago === null ? 0 : [48, 33, 41, 19, 27, 12, 6][i] ?? Math.max(1, 20 - i),
        old_build: i === 6,
      }
    }).filter(r => !q || r.username.includes(q) || `${r.first_name} ${r.last_name}`.toLowerCase().includes(q))
    if (p_sort === 'active') rows = rows.sort((a, b) => b.sessions_30d - a.sessions_30d)
    if (p_sort === 'newest') rows = rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return { total: rows.length, active_30d: rows.filter(r => r.last_seen).length, rows: rows.slice(0, p_limit ?? 50) }
  }

  const activity = ({ p_user }) => {
    const p = PEOPLE.find(x => x.id === p_user)
    if (!p) return null
    const minutes = [12, 0, 8, 0, 25, 45, 50, 0, 6, 0, 9, 22, 40, 28, 7, 10, 0, 0, 6, 41, 38, 0, 8, 9, 0, 24, 44, 20, 9, 0, 7, 21, 6, 47, 24]
    return {
      id: p.id, ...person(p), created_at: iso(nowMs - 58 * DAY), first_seen_as_guest: iso(nowMs - 60 * DAY),
      platforms: ['ios', 'web'], last_seen: iso(nowMs - 10_000), online: true, screen: '/event/[id]',
      platform: 'ios', app_version: '1.6.0', sessions_30d: 48, median_session_s: 540,
      days: minutes.map((m, i) => ({ day: dayKey(nowMs - (34 - i) * DAY), minutes: m })),
      rsvps: 11, hosted: 2, kudos_given: 14,
      recent: [
        { id: 's-now', started_at: iso(nowMs - 24 * MIN), last_seen: iso(nowMs - 10_000), platform: 'ios', app_version: '1.6.0', screens: ['/', '/event/[id]', '/chat', '/chat/[id]', '/event/[id]'] },
        { id: 's-2', started_at: iso(nowMs - 5 * 60 * MIN), last_seen: iso(nowMs - 5 * 60 * MIN + 6 * MIN), platform: 'ios', app_version: '1.6.0', screens: ['/', '/event/[id]'] },
        { id: 's-3', started_at: iso(nowMs - DAY - 3 * 60 * MIN), last_seen: iso(nowMs - DAY - 3 * 60 * MIN + 18 * MIN), platform: 'web', app_version: null, screens: ['/tournaments', '/leagues'] },
        { id: 's-4', started_at: iso(nowMs - 3 * DAY), last_seen: iso(nowMs - 3 * DAY + 41 * MIN), platform: 'ios', app_version: '1.6.0', screens: ['/scorekeeper', '/scorekeeper/[id]', '/scorekeeper/[id]/sheet'] },
      ],
    }
  }

  const events = ({ p_from, p_to }) => ({
    from: p_from, to: p_to,
    outside_links: {
      taps: 41, people: 19,
      by_kind: { session: 27, league: 9, tournament: 3, court: 2 },
      top_orgs: [
        { org: 'Volleyworld', taps: 14, people: 8 },
        { org: 'ACES', taps: 9, people: 6 },
        { org: 'ATX Beach', taps: 8, people: 5 },
        { org: 'Austin Sports & Social Club', taps: 6, people: 4 },
      ],
    },
    shares: { taps: 23, people: 11, by_method: { share_sheet: 15, copy_link: 6, web_share: 2 } },
    filters: [
      { filter: 'tournament', surface: 'all', times: 31, people: 14 },
      { filter: 'open_play', surface: 'sand', times: 18, people: 9 },
      { filter: 'all', surface: 'indoor', times: 7, people: 5 },
    ],
    scorekeeper: { started: 9, finished: 6, people: 3 },
    guest_funnel: { guests: 134, signed_in: 12, rsvped: 7 },
  })

  return {
    current_user_is_admin: () => true,
    admin_metrics_events: events,
    admin_metrics_overview: overview,
    admin_online_now: online,
    admin_retention: retention,
    admin_users: users,
    admin_user_activity: activity,
  }
}
