/**
 * What scripts/shots/stability-flow.mjs checks (#255). Data only: screens to
 * scroll and come back to, the shareable links to round-trip, and the tour
 * walks. `__tests__/stabilityCases.test.ts` fails when a key of `VIEW`
 * (utils/urlViews.ts) has no link case here, so a new link param gets one.
 */
import { IDS } from './fixtures/index.mjs'

/**
 * Screens checked for a jump or a layout shift on refresh, and for coming back
 * to the same offset on Back. `child` is how to leave for a child screen from
 * partway down the page: it is scrolled into the middle of the viewport (that
 * offset is what Back must restore), then clicked.
 * `guest`: also checked signed out. `pr`: also in PR mode (the rest run nightly).
 */
export const SCROLL_SCREENS = [
  { screen: 'events', path: '/', child: { testIdPrefix: 'event-card', nth: 5 }, guest: true, pr: true },
  { screen: 'profile', path: '/profile', child: { testIdPrefix: 'profile-menu-', last: true }, pr: true },
  { screen: 'clubs', path: '/clubs', child: null, guest: true },
  { screen: 'chat', path: '/chat', child: { testIdPrefix: 'conversation-row', last: true } },
  { screen: 'tournaments', path: '/tournaments', child: { testIdPrefix: 'tournament-row-', last: true }, guest: true, pr: true },
  { screen: 'event', path: `/event/${IDS.event.sundaySand}`, child: { text: 'Host' }, guest: true, pr: true },
  { screen: 'club', path: `/club/${IDS.club.eastside}`, child: { testIdPrefix: 'event-card', last: true }, guest: true, pr: true },
]

/**
 * One case per `VIEW` entry (the `view` field names it). `keep`: the params the
 * address must still have once the screen has settled. `change`: one control to
 * use and the params it must leave (`null` = absent). `tabSwitch`: on phones,
 * switch to that tab and back; the view must survive. `expectText`: shown on open.
 * `day(n)` in a link is today + n days in the fixtures' time zone.
 */
export const LINK_CASES = [
  { view: 'feed', path: '/?type=tournament&surface=sand&day={day2}', keep: { type: 'tournament', surface: 'sand', day: '{day2}' }, change: { text: 'Open Play' }, after: { type: 'open_play' }, tabSwitch: 'clubs' },
  { view: 'event', path: `/event/${IDS.event.sundaySand}?tab=people`, keep: { tab: 'people' }, change: { testId: 'event-tab-discussion' }, after: { tab: 'discussion' } },
  { view: 'tournament', path: `/tournament/${IDS.tournament.upcoming}?tab=schedule`, keep: { tab: 'schedule' }, change: { role: 'tab', text: 'Teams' }, after: { tab: 'teams' } },
  { view: 'tournaments', path: '/tournaments?view=past', keep: { view: 'past' }, change: { testId: 'tournaments-upcoming' }, after: { view: null } },
  { view: 'tournaments', path: '/tournaments?host=NAGVA', keep: { host: 'NAGVA' }, change: { text: 'All hosts', exact: false }, after: { host: null } },
  { view: 'leagues', path: '/leagues?host=ACES', keep: { host: 'ACES' }, change: { text: 'All hosts', exact: false }, after: { host: null } },
  { view: 'clubs', path: '/clubs?filter=popular&q=sand', keep: { filter: 'popular', q: 'sand' }, change: { text: 'Near me' }, after: { filter: 'nearby' }, tabSwitch: 'events' },
  // The mock has no court calendars, so Book draws no surface chips: the link is only checked to stay.
  { view: 'book', path: '/book?day={day2}&surface=sand', keep: { day: '{day2}', surface: 'sand' } },
  { view: 'profile', path: '/profile?edit=1', keep: { edit: '1' }, expectText: 'First Name', tabSwitch: 'events' },
  { view: 'badges', path: '/settings/badges?badge=event_host', keep: { badge: 'event_host' } },
  { view: 'feedback', path: '/settings/feedback?type=bug', keep: { type: 'bug' }, change: { text: 'Feature', exact: false }, after: { type: null } },
  { view: 'metrics', path: '/settings/metrics?tab=people&range=7&sort=active', keep: { tab: 'people', range: '7', sort: 'active' }, change: { text: 'Live' }, after: { tab: 'live' } },
  { view: 'login', path: '/login?mode=reset', guest: true, keep: { mode: 'reset' } },
]

const TYPES = ['all', 'open_play', 'tournament']
const SURFACES = ['any', 'indoor', 'sand', 'grass']

/**
 * Intro tour walks. Each: viewport, how it starts ('profile': "Take the tour",
 * signed in; 'banner': the Austin banner's action, as a guest), and the feed
 * filter state, set from a link or saved on the device (localStorage
 * `vteam.feedFilters`). PR mode: every state from a link on phones, a spread on
 * desktop and saved; `full` adds every combination.
 */
export function tourCases(full) {
  const all = []
  for (const viewport of ['phone', 'desktop']) for (const type of TYPES) for (const surface of SURFACES) for (const mode of ['link', 'saved'])
    all.push({ viewport, start: 'profile', type, surface, mode })
  for (const viewport of ['phone', 'desktop']) for (const [type, surface] of [['all', 'any'], ['tournament', 'any'], ['open_play', 'sand'], ['tournament', 'grass']]) for (const mode of ['link', 'saved'])
    all.push({ viewport, start: 'banner', type, surface, mode })
  if (full) return all
  const spread = new Set(['all/any', 'tournament/any', 'open_play/sand', 'tournament/grass'])
  return all.filter(c =>
    c.start === 'banner' ? c.mode === 'link' && (c.type === 'all' || c.type === 'tournament' && c.surface === 'grass')
      : c.mode === 'link' ? c.viewport === 'phone' || spread.has(`${c.type}/${c.surface}`)
        : c.viewport === 'phone' && spread.has(`${c.type}/${c.surface}`))
}
