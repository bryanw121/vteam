/**
 * Game recap (#227): pure rules shared by the app (YourGameCard, RecapFooter)
 * and the picture (`api/og/recap.tsx`). No React Native or Supabase imports:
 * `api/` imports this file.
 */
import { formatShareDate } from './eventShare'

/** Matches `award_event_points()`: 5 for an event tagged Tournament, otherwise 2. */
export const RECAP_POINTS = { tournament: 5, game: 2 } as const
/** Points are paid this long after a game ends (the host's no-show window). */
export const POINTS_DELAY_MS = 2 * 60 * 60 * 1000

export function pointsForEvent(tagNames: readonly string[]): number {
  return tagNames.some(n => n.trim().toLowerCase() === 'tournament') ? RECAP_POINTS.tournament : RECAP_POINTS.game
}

/** Who gets a recap: someone who was attending when the game ended and wasn't flagged a no-show. */
export function recapEligible(row: { status: string; no_show?: boolean | null } | null | undefined): boolean {
  return !!row && row.status === 'attending' && row.no_show !== true
}

/** "Maya K." from a profile; the username, else "A player". */
export function recapName(p: { first_name?: string | null; last_name?: string | null; username?: string | null } | null | undefined): string {
  const first = p?.first_name?.trim()
  const last = p?.last_name?.trim()
  if (first) return last ? `${first} ${last[0].toUpperCase()}.` : first
  return p?.username?.trim() || 'A player'
}

/** "+2" once paid; "+2 after the host's 2-hour window" while the award job hasn't run. */
export function pointsLine(points: number, endedAtMs: number, paid: boolean, nowMs: number): string {
  if (paid || nowMs >= endedAtMs + POINTS_DELAY_MS) return `+${points} points`
  return `+${points} points after the host's 2-hour window`
}

export type RecapMeta = {
  name: string
  title: string
  date: string
  place: string | null
  points: number
  cheers: number
  gamesThisYear: number
}

/** What the picture says. Only the sharer's own name and numbers, never other players. */
export function buildRecapMeta(input: {
  profile: { first_name?: string | null; last_name?: string | null; username?: string | null } | null
  event: { title: string | null; event_date: string; location: string | null }
  tagNames: readonly string[]
  cheers: number
  gamesThisYear: number
}): RecapMeta {
  const title = (input.event.title ?? '').trim() || 'Volleyball'
  return {
    name: recapName(input.profile),
    title: title.length > 60 ? `${title.slice(0, 59).trimEnd()}…` : title,
    date: formatShareDate(input.event.event_date),
    place: input.event.location?.trim() || null,
    points: pointsForEvent(input.tagNames),
    cheers: Math.max(0, input.cheers),
    gamesThisYear: Math.max(1, input.gamesThisYear),
  }
}

/** The picture's URL for a game and player (`v` busts caches when the numbers change). */
export function recapImagePath(eventId: string, userId: string, v?: string): string {
  const q = new URLSearchParams({ event: eventId, user: userId })
  if (v) q.set('v', v)
  return `/api/og/recap?${q.toString()}`
}

/** UTC start of the year the game was played in (Chicago calendar is close enough for a count). */
export function yearStartIso(iso: string): string {
  return `${new Date(iso).getUTCFullYear()}-01-01T00:00:00Z`
}
