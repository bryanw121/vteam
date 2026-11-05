import type { TournamentListItem } from '../types'

/**
 * Split tournaments into Upcoming (soonest first) and Past (latest first).
 * Upcoming: not finished and starting today or later, or under way. Past:
 * completed or cancelled, or a start day already gone.
 */
export function splitTournaments(items: readonly TournamentListItem[], now: Date): { upcoming: TournamentListItem[]; past: TournamentListItem[] } {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const upcoming: TournamentListItem[] = []
  const past: TournamentListItem[] = []
  for (const t of items) {
    const finished = t.status === 'completed' || t.status === 'cancelled'
    const live = t.status === 'in_progress'
    if (!finished && (live || new Date(t.start_date).getTime() >= startOfToday)) upcoming.push(t)
    else past.push(t)
  }
  const at = (t: TournamentListItem) => new Date(t.start_date).getTime()
  upcoming.sort((a, b) => at(a) - at(b))
  past.sort((a, b) => at(b) - at(a))
  return { upcoming, past }
}
