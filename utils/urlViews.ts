import type { FeedFilter, SurfaceFilter, FeedbackKind, UrlCodec } from '../types'
import type { MetricsRangeDays, AdminUserSort, MetricsTab } from '../types/metrics'
import { flag, oneOf, optionalOneOf, tabIndexCodec, text } from './urlState'

/**
 * Each screen's URL params and how they parse (see utils/urlState). The one
 * place the param names are written: screens read and write them with
 * `useUrlParam(name, VIEW.x.y)`, and `routes.*` builds links from the same codecs.
 * Pure; no React Native imports (routes.ts is imported everywhere).
 */

const SURFACES = ['any', 'indoor', 'sand', 'grass'] as const satisfies readonly SurfaceFilter[]

/** Event page tabs, in EVENT_TABS order (components/event/EventTabBar; a test keeps them in step). */
export const EVENT_TAB_LABELS = ['Details', 'People', 'Discussion', 'Cheers'] as const
/** Tournament page tabs, in TOURNAMENT_TABS order (constants/tournamentCopy; a test keeps them in step). */
export const TOURNAMENT_TAB_LABELS = ['Overview', 'Teams', 'Schedule', 'Results', 'Discussion'] as const

export const VIEW = {
  /** Events feed: `/?type=tournament&surface=sand&day=2026-11-14`. `day` is checked against today by `feedDay`. */
  feed: {
    type: oneOf<FeedFilter>(['all', 'open_play', 'tournament'], 'all'),
    surface: oneOf<SurfaceFilter>(SURFACES, 'any'),
    day: text(10),
  },
  event: { tab: tabIndexCodec(EVENT_TAB_LABELS) },
  tournament: { tab: tabIndexCodec(TOURNAMENT_TAB_LABELS) },
  tournaments: {
    view: oneOf(['upcoming', 'past'] as const, 'upcoming'),
    /** An organizer's name as listed; one no longer listed shows everyone. */
    host: text(60),
  },
  leagues: { host: text(60) },
  /** Live scores from a tournament's Google Sheet: `/scores/<program id>?view=brackets&division=Gold`. */
  scores: {
    view: oneOf(['live', 'pools', 'brackets', 'teams'] as const, 'live'),
    division: text(40),
    /** A team's page on the Teams tab (`?view=teams&team=Bag%20toss`). */
    team: text(80),
  },
  clubs: {
    filter: oneOf(['joined', 'nearby', 'popular'] as const, 'joined'),
    q: text(60),
  },
  book: { day: text(10), surface: oneOf<SurfaceFilter>(SURFACES, 'any') },
  profile: { edit: flag },
  badges: { badge: text(40) },
  feedback: { type: oneOf<FeedbackKind>(['feature', 'bug'], 'feature') },
  metrics: {
    tab: oneOf<MetricsTab>(['overview', 'live', 'people', 'retention', 'reports'], 'overview'),
    range: {
      parse: raw => (raw === '7' ? 7 : raw === '90' ? 90 : 30),
      format: v => (v === 30 ? undefined : String(v)),
    } satisfies UrlCodec<MetricsRangeDays>,
    q: text(60),
    sort: oneOf<AdminUserSort>(['last_seen', 'active', 'newest'], 'last_seen'),
  },
  login: { mode: optionalOneOf(['reset', 'code'] as const) },
} as const

/** The values a screen's link can carry, from its codecs. */
export type ViewOf<K extends keyof typeof VIEW> = {
  [P in keyof (typeof VIEW)[K]]?: (typeof VIEW)[K][P] extends UrlCodec<infer T> ? T : never
}
