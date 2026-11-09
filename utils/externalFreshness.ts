import { EXTERNAL_SESSION_CONFIRM_DAYS } from '../constants/events'
import type { ExternalSession, SessionConfirmation } from '../types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Whether Schelagg has confirmed an outside session recently enough (`verified_at`, the last day it
 * saw the session at its source). `today` is the viewer's local date key (YYYY-MM-DD).
 * - `ok`: confirmed recently, or no date to judge by.
 * - `unconfirmed`: show it, with "Couldn't recheck since <date>" (scraped) or "Last checked <date>" (hand-checked).
 * - `hidden`: a scraped source that hasn't been read for a week; the session may be long gone.
 */
export function sessionConfirmation(session: Pick<ExternalSession, 'source_id' | 'verified_at'>, today: string): SessionConfirmation {
  const v = session.verified_at?.slice(0, 10)
  if (!v || !/^\d{4}-\d\d-\d\d$/.test(v)) return { state: 'ok', note: null }
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${v}T00:00:00Z`)) / 86_400_000)
  const [, m, d] = v.split('-').map(Number)
  const when = `${MONTHS[m - 1]} ${d}`
  const C = EXTERNAL_SESSION_CONFIRM_DAYS
  if (session.source_id === 'manual') {
    return days > C.manualNote ? { state: 'unconfirmed', note: `Last checked ${when}: confirm with the venue` } : { state: 'ok', note: null }
  }
  if (days > C.scrapedHide) return { state: 'hidden', note: null }
  if (days > C.scrapedNote) return { state: 'unconfirmed', note: `Couldn't recheck with the venue since ${when}` }
  return { state: 'ok', note: null }
}
