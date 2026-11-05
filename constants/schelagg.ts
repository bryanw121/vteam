/**
 * Schelagg (github.com/bryanw121/schelagg) is a separate public project that
 * aggregates Austin volleyball schedules and court availability. vteam only
 * reads from it: these are the only places its URLs are written.
 */

/** Live API (Vercel): /api/courts and /api/check. Change here when the deploy URL is final. */
export const SCHELAGG_API_BASE = 'https://schelagg.vercel.app'

/** Static site (GitHub Pages). `data/courts.json` has the same shape as /api/courts, rebuilt ~every 15 min. */
export const SCHELAGG_SITE_BASE = 'https://bryanw121.github.io/schelagg'

/** Days of court availability to load (the booking screen's day strip). */
export const COURTS_DAYS = 7

/** Court data older than this gets a "may be out of date" note (the static file refreshes ~every 15 min). */
export const COURTS_OLD_AFTER_MS = 45 * 60_000

/** How long the live API gets before the booking screen falls back to the static file. */
export const COURTS_API_TIMEOUT_MS = 6_000

/** Last-mile check before opening an outside session's sign-up link: past this, just open it. */
export const SESSION_CHECK_TIMEOUT_MS = 1_500

/** The hour grid on the booking screen starts here (minutes after midnight) unless a venue opens earlier. */
export const COURT_GRID_START_MIN = 6 * 60

/** Free windows shorter than this are left out of a facility's "Free ..." summary. */
export const COURT_MIN_FREE_MIN = 30
