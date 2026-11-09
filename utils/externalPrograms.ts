import type { ExternalProgram, ProgramsForRegion } from '../types'

/**
 * Leagues and tournaments run outside vteam (Schelagg's programs feed, `external_programs`).
 * Pure helpers: grouping for a region and the words cards show. Dates are `YYYY-MM-DD` in the
 * organizer's zone; `today` is the viewer's local date key, which is the same day in Texas.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parts(day: string): { y: number; m: number; d: number } {
  const [y, m, d] = day.split('-').map(Number)
  return { y, m, d }
}

/** "Nov 28" */
export function shortDay(day: string): string {
  const { m, d } = parts(day)
  return `${MONTHS[m - 1]} ${d}`
}

/** "Sat, Nov 28" */
export function weekdayDay(day: string): string {
  const { y, m, d } = parts(day)
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${shortDay(day)}`
}

/** Whole days from `today` to `day` (both `YYYY-MM-DD`). */
export function daysUntil(day: string, today: string): number {
  const a = parts(today), b = parts(day)
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000)
}

const byDeadline = (a: ExternalProgram, b: ExternalProgram) =>
  (a.registration_deadline ?? '9999').localeCompare(b.registration_deadline ?? '9999')
  || (a.starts_on ?? '9999').localeCompare(b.starts_on ?? '9999')
const byStart = (a: ExternalProgram, b: ExternalProgram) => (a.starts_on ?? '9999').localeCompare(b.starts_on ?? '9999')

/** Still worth showing on `today`: not over, and its sign-up hasn't closed for good. */
export function isCurrent(p: ExternalProgram, today: string): boolean {
  if (p.ends_on && p.ends_on < today) return false
  if (p.registration_deadline && p.registration_deadline < today) return false
  return true
}

/**
 * The region's outside tournaments and leagues, and NAGVA tournaments elsewhere in its state (people
 * travel for those). The state is read from the region's own rows, so no region-to-state table is kept.
 */
export function programsForRegion(rows: readonly ExternalProgram[], region: string, today: string): ProgramsForRegion {
  const current = rows.filter(p => isCurrent(p, today))
  const here = current.filter(p => p.region === region)
  const state = here.find(p => p.state)?.state ?? null
  return {
    tournaments: here.filter(p => p.kind === 'tournament').sort(byStart),
    leagues: here.filter(p => p.kind === 'league').sort(byDeadline),
    nagvaElsewhere: state
      ? current.filter(p => p.series === 'nagva' && p.kind === 'tournament' && p.region !== region && p.state === state).sort(byStart)
      : [],
  }
}

/** What's urgent about signing up, or null: "Last day to sign up", "3 days left", "Early bird ends today". */
export function programUrgency(p: ExternalProgram, today: string): string | null {
  if (p.status === 'closed' || p.status === 'full') return null
  if (p.price_changes_on && p.price_changes_on >= today) {
    const n = daysUntil(p.price_changes_on, today)
    if (n === 0) return `${p.price_note ?? 'This price'} ends today`
    if (n === 1) return 'Price goes up after tomorrow'
  }
  if (p.registration_deadline) {
    const n = daysUntil(p.registration_deadline, today)
    if (n === 0) return 'Last day to sign up'
    if (n === 1) return '1 day left'
    if (n <= 7) return `${n} days left`
  }
  return null
}

/** "Sundays · Nov 15 – Jan 24" for a league, "Sat, Dec 5" or "Fri, Dec 18 – Sat, Dec 19" for a tournament. */
export function programWhen(p: ExternalProgram): string {
  if (!p.starts_on) return ''
  const multi = !!p.ends_on && p.ends_on !== p.starts_on
  if (p.kind === 'league') {
    const days = p.weekdays.length ? `${p.weekdays.map(d => `${d}s`).join(' & ')} · ` : ''
    return `${days}${multi ? `${shortDay(p.starts_on)} – ${shortDay(p.ends_on!)}` : `from ${shortDay(p.starts_on)}`}`
  }
  return multi ? `${weekdayDay(p.starts_on)} – ${weekdayDay(p.ends_on!)}` : weekdayDay(p.starts_on)
}

/** "$600 team · $90 free agent", "$45 per player", or null when the page lists no price. */
export function programPrice(p: Pick<ExternalProgram, 'team_price' | 'individual_price'>): string | null {
  const parts = [
    p.team_price && `${p.team_price} team`,
    p.individual_price && `${p.individual_price} ${p.team_price ? 'free agent' : 'per player'}`,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/** "Sign up by Fri, Nov 13", "Opens Dec 1", "Waitlist", "Full", "Registration closed". */
export function programDeadline(p: ExternalProgram, today: string): string {
  if (p.status === 'closed') return p.registration_opens && p.registration_opens > today ? `Opens ${shortDay(p.registration_opens)}` : 'Registration closed'
  if (p.status === 'full') return 'Full'
  if (p.status === 'waitlist') return 'Waitlist'
  return p.registration_deadline ? `Sign up by ${weekdayDay(p.registration_deadline)}` : ''
}

/** Kicker over a card: "TOURNAMENT · SAND · ACES". */
export function programKicker(p: ExternalProgram): string {
  const surface = p.surface ? p.surface[0].toUpperCase() + p.surface.slice(1) : null
  return [p.kind === 'league' ? 'League' : 'Tournament', surface, p.org].filter(Boolean).join(' · ')
}

/** Divisions as one line: "A1 · 7 of 12 confirmed, BB · 30 of 24 confirmed", or the names alone. */
export function programDivisions(p: ExternalProgram): string {
  return p.divisions.map(d => {
    if (d.cap && d.confirmed != null) return `${d.name} (${d.confirmed} of ${d.cap} confirmed)`
    if (d.cap) return `${d.name} (up to ${d.cap})`
    return d.name
  }).join(', ')
}

/** Who runs these (ACES, NAGVA, a Reclub club…) with how many each, most first, then by name. */
export function programHosts(rows: readonly ExternalProgram[]): { org: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const p of rows) counts.set(p.org, (counts.get(p.org) ?? 0) + 1)
  return [...counts].map(([org, count]) => ({ org, count })).sort((a, b) => b.count - a.count || a.org.localeCompare(b.org))
}

/** Rows from one host, or all of them for null (or a host no longer listed). */
export function byHost<T extends Pick<ExternalProgram, 'org'>>(rows: readonly T[], host: string | null): T[] {
  return host && rows.some(p => p.org === host) ? rows.filter(p => p.org === host) : [...rows]
}
