import { SHARE_TIME_ZONE } from '../constants/share'
import { formatShareDate, formatShareTime, GENERIC_PREVIEW } from './eventShare'
import { formatWith } from './dateFormat'
import { programDeadline, programWhen } from './externalPrograms'
import { routes } from './routes'
import type { EventPreviewMeta, ExternalProgram, ExternalSession } from '../types'

/**
 * Sharing games run outside vteam (#395): the one line that goes with the link, and the link
 * preview `api/outside-page.ts` serves. Pure and free of React Native: `api/` imports it.
 * Times are written in `SHARE_TIME_ZONE`, like event shares.
 */

export type ShareableSession = Pick<ExternalSession, 'title' | 'venue' | 'city' | 'starts_at' | 'ends_at' | 'price' | 'level'>

/** "Sand open play at Zilker Park, Sat, Nov 28 at 10:00 AM. $8 · All levels." */
export function sessionShareText(s: ShareableSession): string {
  const when = `${formatShareDate(s.starts_at)} at ${formatShareTime(s.starts_at)}`
  const extra = [s.price, s.level].filter(Boolean).join(' · ')
  return `${s.title} at ${s.venue}, ${when}.${extra ? ` ${extra}.` : ''}`
}

/** "NAGVA Lone Star Classic in Houston, Sat, Dec 5 – Sun, Dec 6. Sign up by Mon, Nov 30." */
export function programShareText(p: ExternalProgram, today: string): string {
  const where = p.city ? ` in ${p.city}` : ''
  const when = programWhen(p)
  const deadline = programDeadline(p, today)
  return `${p.title}${where}${when ? `, ${when}` : ''}.${deadline ? ` ${deadline}.` : ''}`
}

/** Today in the share time zone, `YYYY-MM-DD` (what the program helpers compare against). */
export function shareToday(now: Date): string {
  return formatWith(now, { timeZone: SHARE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-CA')
}

/** Link preview for `/?session=<id>`: the session, or the generic card when it's gone. */
export function sessionPreviewMeta(s: ShareableSession | null, now: Date): EventPreviewMeta {
  if (!s) return GENERIC_PREVIEW
  const ended = new Date(s.ends_at ?? s.starts_at).getTime() < now.getTime()
  const title = `${s.title} at ${s.venue}`
  return {
    state: ended ? 'ended' : 'upcoming',
    title: ended ? `${title} (ended)` : title,
    description: `${sessionShareText(s)} On vteam, with the sign-up link.`,
    imageAlt: `${title}, ${formatShareDate(s.starts_at)}`,
  }
}

/** Link preview for `?program=<id>`: the tournament or league, or the generic card when it's gone. */
export function programPreviewMeta(p: ExternalProgram | null, today: string): EventPreviewMeta {
  if (!p) return GENERIC_PREVIEW
  const ended = !!(p.ends_on ?? p.starts_on) && (p.ends_on ?? p.starts_on)! < today
  return {
    state: ended ? 'ended' : 'upcoming',
    title: ended ? `${p.title} (ended)` : p.title,
    description: `${p.kind === 'league' ? 'League' : 'Tournament'} run by ${p.org}. ${programShareText(p, today)}`,
    imageAlt: `${p.title}, run by ${p.org}`,
  }
}

/** Where a shared link to an outside tournament or league points: its sheet on Tournaments or Leagues. */
export function programPath(p: Pick<ExternalProgram, 'id' | 'kind'>): string {
  return p.kind === 'league' ? routes.leagues({ program: p.id }) : routes.tournaments({ program: p.id })
}
