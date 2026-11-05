/**
 * Venmo "Pay" links for paid events and tournaments.
 *
 * Why this exists (issue #6): the memo used to arrive in Venmo as a raw slug,
 * e.g. `Open+Play+—+entry+fee+—+b+w.+—+May+3,+2026`. Our side always used
 * `encodeURIComponent` (spaces → `%20`), so the `+` came from Venmo: the old web
 * link (`venmo.com/<handle>?…`) redirects, and that redirect re-serialises the
 * query with form encoding (space → `+`), which the Venmo app then shows
 * literally. So:
 *   - native opens the app's own scheme (`venmo://paycharge`) directly, and
 *   - web (and the native fallback) goes straight to the pay page
 *     (`account.venmo.com/pay`), with no redirect in between.
 * Every value is percent-encoded with `encodeURIComponent` (never `+`), and the
 * memo itself is short and plain: "Open Play · Sat, Nov 1 · vteam".
 */
import type { VenmoLinks } from '../types'

/** Venmo caps notes well above this; a long title is cut so the date stays visible. */
const MAX_LABEL_LENGTH = 40
const MEMO_SEPARATOR = ' · '
const MEMO_SUFFIX = 'vteam'

/** Supabase `timestamp without time zone` strings have no suffix and are UTC. */
function parseDbDate(value: string): Date {
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(value)
  return new Date(hasZone ? value : value + 'Z')
}

/** "Sat, Nov 1" in the viewer's time zone (the host's people see the same local day). */
export function formatVenmoDate(value: string, timeZone?: string): string {
  const date = parseDbDate(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(timeZone ? { timeZone } : {}) })
}

/** Collapse whitespace and trim a title to `MAX_LABEL_LENGTH`, ending in an ellipsis when cut. */
function cleanLabel(label: string): string {
  const flat = label.replace(/\s+/g, ' ').trim()
  if (flat.length <= MAX_LABEL_LENGTH) return flat
  return flat.slice(0, MAX_LABEL_LENGTH - 1).trimEnd() + '…'
}

/** The human-readable memo: "<title> · <Sat, Nov 1> · vteam". Empty parts are skipped. */
export function venmoNote(title: string, dateValue: string, timeZone?: string): string {
  return [cleanLabel(title), formatVenmoDate(dateValue, timeZone), MEMO_SUFFIX]
    .filter(Boolean)
    .join(MEMO_SEPARATOR)
}

/** A Venmo username as typed by a host: drop a leading "@" and surrounding spaces. */
export function cleanVenmoHandle(handle: string): string {
  return handle.trim().replace(/^@+/, '')
}

/**
 * Both links for one payment. `amount` is the bare number string (see
 * `formatPriceAmount`). Query strings are built by hand with
 * `encodeURIComponent`, not `URLSearchParams`, which would turn spaces into `+`.
 */
export function venmoPayLinks(handle: string, amount: string, note: string): VenmoLinks {
  const query = [
    ['txn', 'pay'],
    ['recipients', cleanVenmoHandle(handle)],
    ['amount', amount],
    ['note', note],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')
  return {
    app: `venmo://paycharge?${query}`,
    web: `https://account.venmo.com/pay?${query}`,
  }
}
