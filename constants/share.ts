/**
 * Share links (#130). No imports: the Vercel functions in `api/` load this too.
 *
 * A shared event is always an `https://` link to the web app, never the
 * `vteam://` scheme, so it opens for anyone (guest browsing) and link-preview
 * crawlers can fetch it (`api/event-page.ts` adds the rich preview tags).
 */

/** The production web app. Override per build with `EXPO_PUBLIC_WEB_ORIGIN`. */
export const DEFAULT_WEB_ORIGIN = 'https://vteamvolleyball.com'

const trimSlash = (origin: string) => origin.replace(/\/+$/, '')

/**
 * Where shared links point. `EXPO_PUBLIC_WEB_ORIGIN` (inlined at build) wins;
 * otherwise the production domain. Read `shareUrl()` rather than this when the
 * web app should share the origin it is running on (preview deploys, localhost).
 */
export const WEB_ORIGIN = trimSlash(process.env.EXPO_PUBLIC_WEB_ORIGIN || DEFAULT_WEB_ORIGIN)

/**
 * Absolute https link for an in-app path (`shareUrl(routes.event(id))`).
 * On web with no `EXPO_PUBLIC_WEB_ORIGIN`, the page's own origin, so a preview
 * deploy shares links to itself; native and server code use `WEB_ORIGIN`.
 */
export function shareUrl(path: string): string {
  if (!process.env.EXPO_PUBLIC_WEB_ORIGIN && typeof window !== 'undefined' && /^https?:$/.test(window.location?.protocol ?? '')) {
    return trimSlash(window.location.origin) + path
  }
  return WEB_ORIGIN + path
}

/**
 * The zone event times are written in when they leave the app (share text,
 * link previews): the pilot region's, so every recipient reads the same time
 * whatever their phone or the server is set to. Per-region once we expand.
 */
export const SHARE_TIME_ZONE = 'America/Chicago'
