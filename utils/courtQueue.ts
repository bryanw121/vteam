import type { CourtQueueGame, CourtQueuePlace, CourtQueueRule, CourtQueueSnapshot, CourtQueueState, CourtQueueTally } from '../types'

/**
 * The court queue for open play (#333), pure. A host taps who won on a court;
 * the loser goes to the back of the line and the winner stays (until the
 * night's limit of wins in a row) or comes off too. Teams that have waited
 * longest go on first. Every change keeps the previous state for Undo.
 */

export const COURT_QUEUE_MAX_COURTS = 4
export const COURT_QUEUE_UNDO_DEPTH = 10
/** Games kept for tonight's tally (the saved row stays small). */
export const COURT_QUEUE_MAX_GAMES = 200

type Snapshot = Omit<CourtQueueState, 'undo'>

function snapshot(s: CourtQueueState): CourtQueueSnapshot {
  return { courts: s.courts, queue: s.queue, streaks: s.streaks, gameCount: s.games.length }
}

function withUndo(prev: CourtQueueState, next: Snapshot): CourtQueueState {
  return { ...next, undo: [...prev.undo, snapshot(prev)].slice(-COURT_QUEUE_UNDO_DEPTH) }
}

/** Courts that can be used with this many teams (two per court, at least one court). */
export function usableCourts(teamCount: number, courts: number): number {
  return Math.max(1, Math.min(COURT_QUEUE_MAX_COURTS, courts, Math.floor(teamCount / 2)))
}

/** Start: teams fill the courts in order (1 v 2 on court 1, 3 v 4 on court 2…), the rest wait. */
export function startQueue(teams: number[], courts: number): CourtQueueState {
  const order = [...new Set(teams)].sort((a, b) => a - b)
  if (order.length < 2) throw new Error('A court queue needs at least two teams')
  const n = usableCourts(order.length, courts)
  const on: ([number, number] | null)[] = Array.from({ length: n }, (_, i) => [order[2 * i], order[2 * i + 1]])
  return { courts: on, queue: order.slice(2 * n), streaks: {}, games: [], undo: [] }
}

/** Does the winner leave the court too, after this many wins in a row? */
export function winnerComesOff(rule: CourtQueueRule, streak: number): boolean {
  if (rule.kind === 'both_off') return true
  return rule.stayMax !== null && streak >= rule.stayMax
}

/** `winner` beat the other team on `court` (0-based). */
export function recordResult(s: CourtQueueState, rule: CourtQueueRule, court: number, winner: number): CourtQueueState {
  const pair = s.courts[court]
  if (!pair || !pair.includes(winner)) throw new Error(`Team ${winner} isn't on court ${court + 1}`)
  const loser = pair[0] === winner ? pair[1] : pair[0]
  const streak = (s.streaks[String(winner)] ?? 0) + 1
  const streaks = { ...s.streaks }
  delete streaks[String(loser)]
  const queue = [...s.queue]
  const game: CourtQueueGame = { court, winner, loser }
  const games = [...s.games, game].slice(-COURT_QUEUE_MAX_GAMES)
  let next: [number, number]
  if (winnerComesOff(rule, streak)) {
    delete streaks[String(winner)]
    queue.push(winner, loser)
    const a = queue.shift() as number
    const b = queue.shift() as number
    next = [a, b]
  } else {
    streaks[String(winner)] = streak
    queue.push(loser)
    const challenger = queue.shift() as number
    // The winner keeps its side.
    next = pair[0] === winner ? [winner, challenger] : [challenger, winner]
  }
  const courts = s.courts.map((p, i) => (i === court ? next : p))
  return withUndo(s, { courts, queue, streaks, games })
}

/**
 * Change how many courts are in use mid-night: a new court takes the next two
 * teams in line; a court that closes sends its teams to the front of the line.
 */
export function setCourtCount(s: CourtQueueState, courts: number): CourtQueueState {
  const target = usableCourts(teamsIn(s).length, courts)
  if (target === s.courts.length) return s
  let queue = [...s.queue]
  let on = [...s.courts]
  const streaks = { ...s.streaks }
  if (target < on.length) {
    const closing = on.slice(target).flatMap(p => p ?? [])
    closing.forEach(t => delete streaks[String(t)])
    queue = [...closing, ...queue]
    on = on.slice(0, target)
  } else {
    while (on.length < target && queue.length >= 2) on.push([queue.shift() as number, queue.shift() as number])
  }
  return withUndo(s, { courts: on, queue, streaks, games: s.games })
}

/** Back to the state before the last change; unchanged when there is nothing to undo. */
export function undoLast(s: CourtQueueState): CourtQueueState {
  if (s.undo.length === 0) return s
  const { gameCount, ...prev } = s.undo[s.undo.length - 1]
  return { ...prev, games: s.games.slice(0, gameCount), undo: s.undo.slice(0, -1) }
}

/** The host reorders the line. `queue` must hold exactly the waiting teams. */
export function reorderQueue(s: CourtQueueState, queue: number[]): CourtQueueState {
  const same = queue.length === s.queue.length && [...queue].sort().join() === [...s.queue].sort().join()
  if (!same) throw new Error('The new order must hold the same teams')
  return withUndo(s, { courts: s.courts, queue, streaks: s.streaks, games: s.games })
}

/** Move one waiting team up (-1) or down (+1) the line. */
export function moveInQueue(s: CourtQueueState, team: number, by: -1 | 1): CourtQueueState {
  const i = s.queue.indexOf(team)
  const j = i + by
  if (i < 0 || j < 0 || j >= s.queue.length) return s
  const queue = [...s.queue]
  ;[queue[i], queue[j]] = [queue[j], queue[i]]
  return reorderQueue(s, queue)
}

/**
 * The event's teams changed under a running queue (the host re-made teams, or
 * changed how many): teams that are gone leave courts and the line, new teams
 * join the back, and an emptied court spot is filled from the front.
 */
export function syncTeams(s: CourtQueueState, teams: number[]): CourtQueueState {
  const keep = new Set(teams)
  const placed = new Set<number>()
  let queue = s.queue.filter(t => keep.has(t))
  queue.forEach(t => placed.add(t))
  const halves: (number | null)[][] = s.courts.map(p => (p ? p.map(t => (keep.has(t) ? t : null)) : [null, null]))
  halves.flat().forEach(t => { if (t !== null) placed.add(t) })
  queue = [...queue, ...[...keep].filter(t => !placed.has(t)).sort((a, b) => a - b)]
  const courts = halves.map(h => {
    const filled = h.map(t => (t === null ? queue.shift() ?? null : t))
    return filled[0] !== null && filled[1] !== null ? [filled[0], filled[1]] as [number, number] : null
  })
  // A court that can't be filled gives its one team back to the front of the line.
  halves.forEach((h, i) => {
    if (courts[i] === null) h.forEach(t => { if (t !== null) queue.unshift(t) })
  })
  const unchanged = JSON.stringify(courts) === JSON.stringify(s.courts) && queue.join() === s.queue.join()
  if (unchanged) return s
  const streaks = Object.fromEntries(Object.entries(s.streaks).filter(([t]) => keep.has(Number(t))))
  return withUndo(s, { courts, queue, streaks, games: s.games })
}

/** Where `team` is: on a court, or how many teams wait before it. */
export function placeOf(s: CourtQueueState, team: number | null): CourtQueuePlace {
  if (team === null) return null
  const court = s.courts.findIndex(p => !!p && p.includes(team))
  if (court >= 0) return { kind: 'court', court }
  const i = s.queue.indexOf(team)
  return i >= 0 ? { kind: 'queue', ahead: i } : null
}

/** Wins and losses tonight, by team, best record first. */
export function tally(s: CourtQueueState): CourtQueueTally[] {
  const by = new Map<number, CourtQueueTally>()
  const row = (t: number) => by.get(t) ?? by.set(t, { team: t, wins: 0, losses: 0 }).get(t) as CourtQueueTally
  for (const g of s.games) {
    row(g.winner).wins += 1
    row(g.loser).losses += 1
  }
  return [...by.values()].sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.team - b.team)
}

/** Every team number in the state (for validation). */
export function teamsIn(s: CourtQueueState): number[] {
  return [...s.courts.flatMap(p => p ?? []), ...s.queue]
}

/** The rule as stored (`event_court_queues.rule` / `stay_max`). */
export function ruleColumns(rule: CourtQueueRule): { rule: 'stay' | 'both_off'; stay_max: number | null } {
  return rule.kind === 'both_off' ? { rule: 'both_off', stay_max: null } : { rule: 'stay', stay_max: rule.stayMax }
}

export function ruleFromColumns(rule: string, stayMax: number | null): CourtQueueRule {
  return rule === 'both_off' ? { kind: 'both_off' } : { kind: 'stay', stayMax }
}

/** A saved state from the database, checked; null when it isn't one (an older or broken row). */
export function parseQueueState(json: unknown): CourtQueueState | null {
  const s = json as Partial<CourtQueueState> | null
  const isTeam = (t: unknown) => Number.isInteger(t) && (t as number) >= 1 && (t as number) <= 6
  if (!s || typeof s !== 'object' || !Array.isArray(s.courts) || !Array.isArray(s.queue)) return null
  if (!s.courts.every(p => p === null || (Array.isArray(p) && p.length === 2 && p.every(isTeam)))) return null
  if (!s.queue.every(isTeam)) return null
  return {
    courts: s.courts as CourtQueueState['courts'],
    queue: s.queue,
    streaks: s.streaks && typeof s.streaks === 'object' ? s.streaks : {},
    games: Array.isArray(s.games) ? s.games : [],
    undo: Array.isArray(s.undo) ? s.undo : [],
  }
}

/** Before the start (30 min) until 3 hours after the end, the host is offered the court queue. */
export const COURT_QUEUE_OPENS_BEFORE_MS = 30 * 60_000
export const COURT_QUEUE_CLOSES_AFTER_MS = 3 * 60 * 60_000
export function courtQueueOffered(startMs: number, durationMinutes: number | null, cancelled: boolean, now: number = Date.now()): boolean {
  if (cancelled) return false
  const end = startMs + (durationMinutes ?? 120) * 60_000
  return now >= startMs - COURT_QUEUE_OPENS_BEFORE_MS && now <= end + COURT_QUEUE_CLOSES_AFTER_MS
}

/** The saved teams of an event (attending players and +1s with a team), ascending. */
export function savedTeams(rows: { team_number?: number | null }[]): number[] {
  return [...new Set(rows.map(r => r.team_number).filter((t): t is number => typeof t === 'number' && t >= 1))].sort((a, b) => a - b)
}
