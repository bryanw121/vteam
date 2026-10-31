import type { Href } from 'expo-router'
import type { Surface } from '../types'

/**
 * Typed route builders — the one place route strings are written and the one
 * place they are cast to `Href`. Screens call `router.push(routes.event(id))`
 * and never build `/event/${id}` or cast to `any` themselves.
 *
 * Expo Router's typed routes are off, so `Href` is currently `string | object`.
 * If typed routes are switched on later, only the `href` helper below changes.
 *
 * Every builder returns a plain string at runtime. The type is `Href & string`
 * so a result can be passed to `router.push/replace` and also compared or
 * prefix-matched as a string (see utils/authGate.ts).
 */
export type RouteString = Href & string

const href = (path: string) => path as RouteString

/**
 * Whether `path` is safe to hand to the router: an in-app absolute path. Rejects
 * protocol-relative (`//host`), absolute URLs (`https://`, `javascript:`) and any
 * backslash (browsers read `/\host` as `//host`).
 * Use before pushing a path that came from outside the app (notification
 * deep links, `?from=` params).
 */
export function isAppPath(path: unknown): path is string {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !path.includes('://') && !path.includes('\\')
}

/** Wrap a runtime path (post-sign-in redirect, `?from=`, tab path) for the router. Validate untrusted input with `isAppPath` first. */
export const toRoute = href

export type SettingsSection =
  | 'account'
  | 'hosted'
  | 'history'
  | 'cheers'
  | 'silenced'
  | 'notifications'
  | 'display'
  | 'feedback'
  | 'badges'
  | 'ad-free'

export type HostRouteOptions = {
  /** Event id to edit. */
  edit?: string
  /** Prefill the max-attendees field (the "Open Play" shortcut uses 18). */
  maxAttendees?: number
  /** Open the host screen on the template picker. */
  mode?: 'templates'
  /** Prefill the location (e.g. a venue name from Book a court). */
  location?: string
  /** Prefill the surface. */
  surface?: Surface
}

export const routes = {
  // ── Tabs ────────────────────────────────────────────────────────────────
  events: () => href('/'),
  clubs: () => href('/clubs'),
  chat: () => href('/chat'),
  profile: () => href('/profile'),

  // ── Detail screens ──────────────────────────────────────────────────────
  event: (id: string) => href(`/event/${id}`),
  /** Event page that returns to `from` (a path, possibly with a query) on back. */
  eventFrom: (id: string, from: string) => href(`/event/${id}?from=${encodeURIComponent(from)}`),
  club: (id: string) => href(`/club/${id}`),
  clubCreate: () => href('/club/create'),
  /** Another user's profile (your own is the Profile tab: `routes.profile()`). */
  profileOf: (id: string) => href(`/profile/${id}`),
  conversation: (id: string) => href(`/chat/${id}`),
  tournament: (id: string) => href(`/tournament/${id}`),
  tournamentCreate: () => href('/tournament/create'),
  tournaments: () => href('/tournaments'),

  host: (opts: HostRouteOptions = {}) => {
    const query: string[] = []
    if (opts.edit !== undefined) query.push(`edit=${encodeURIComponent(opts.edit)}`)
    if (opts.maxAttendees !== undefined) query.push(`maxAttendees=${opts.maxAttendees}`)
    if (opts.mode !== undefined) query.push(`mode=${opts.mode}`)
    if (opts.location) query.push(`location=${encodeURIComponent(opts.location)}`)
    if (opts.surface !== undefined) query.push(`surface=${opts.surface}`)
    return href(query.length ? `/host?${query.join('&')}` : '/host')
  },

  /** Court availability at venues that rent by the hour; booking itself happens on the venue's site. Public. */
  book: () => href('/book'),

  /** Terms and Conditions / Privacy Policy. Public (outside the auth gate). */
  terms: () => href('/terms'),
  privacy: () => href('/privacy'),

  notifications: () => href('/notifications'),
  settings: (section?: SettingsSection) => href(section ? `/settings/${section}` : '/settings'),

  // ── Groups ──────────────────────────────────────────────────────────────
  login: () => href('/(auth)/login'),
  register: () => href('/(auth)/register'),
  /** The signed-in app group (resolves to the Events tab). */
  app: () => href('/(app)'),
}
