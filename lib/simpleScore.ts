/**
 * Simple score: a plain point counter for people who don't want the official scoresheet.
 * Two teams, sets, points, who serves, undo. Pure; the state is replayed from the rally log,
 * like the full scorekeeper's engine.
 */
import type { SimpleFormat, SimpleMatch, SimpleSetScore, SimpleState, TeamSide } from '../types/scoresheet'

export const SIMPLE_FORMATS: { key: string; label: string; format: SimpleFormat }[] = [
  { key: 'one25', label: '1 set to 25', format: { sets: 1, target: 25, cap: null } },
  { key: 'bo3', label: 'Best of 3 (25, 25, 15)', format: { sets: 3, target: 25, cap: null } },
  { key: 'bo5', label: 'Best of 5 (25 ×4, 15)', format: { sets: 5, target: 25, cap: null } },
  { key: 'one21', label: '1 set to 21', format: { sets: 1, target: 21, cap: null } },
  { key: 'bo3_21', label: 'Best of 3 (21, 21, 15)', format: { sets: 3, target: 21, cap: null } },
]

const other = (t: TeamSide): TeamSide => (t === 'A' ? 'B' : 'A')
export const setsToWin = (f: SimpleFormat) => Math.ceil(f.sets / 2)

/** Points to win set `index` (0-based): the deciding set of a best-of-3/5 plays to 15. */
export function setTarget(f: SimpleFormat, index: number): number {
  return f.sets > 1 && index === f.sets - 1 ? Math.min(15, f.target) : f.target
}

/** Who won the set at this score, if it's over: target reached 2 ahead, or the cap. */
export function setWinner(a: number, b: number, target: number, cap: number | null): TeamSide | null {
  const hi = Math.max(a, b)
  const lead = Math.abs(a - b)
  if (hi >= target && lead >= 2) return a > b ? 'A' : 'B'
  if (cap != null && hi >= cap && a !== b) return a > b ? 'A' : 'B'
  return null
}

export function replaySimple(m: SimpleMatch): SimpleState {
  const f = m.format
  const sets: SimpleSetScore[] = [{ A: 0, B: 0, target: setTarget(f, 0), winner: null }]
  const setsWon = { A: 0, B: 0 }
  // The first server of each set alternates; a rally's winner serves next.
  let setFirstServe = m.firstServe
  let serving = m.firstServe
  let over = false
  let setJustEnded = false
  // Index in the rally log where the set on the board began.
  let setStart = 0
  for (const [i, team] of m.rallies.entries()) {
    if (over) break
    setJustEnded = false
    const set = sets[sets.length - 1]
    set[team] += 1
    serving = team
    const won = setWinner(set.A, set.B, set.target, f.cap)
    if (!won) continue
    set.winner = won
    setsWon[won] += 1
    setJustEnded = true
    if (setsWon[won] >= setsToWin(f)) { over = true; break }
    setFirstServe = other(setFirstServe)
    serving = setFirstServe
    sets.push({ A: 0, B: 0, target: setTarget(f, sets.length), winner: null })
    setStart = i + 1
  }
  const winner = over ? (setsWon.A > setsWon.B ? 'A' : 'B') : null
  return { sets, current: sets.length - 1, setsWon, serving, over, winner, setJustEnded, setStart }
}

/** A point to `team`; ignored once the match is over. */
export function addPoint(m: SimpleMatch, team: TeamSide, now: number): SimpleMatch {
  if (replaySimple(m).over) return m
  return { ...m, rallies: [...m.rallies, team], updatedAt: now }
}

/**
 * −1 for `team`: takes away that team's latest point in the set on the board (it can be any
 * rally of the set, not only the last one). Earlier sets are never touched. Unchanged when the
 * team has no points in this set.
 */
export function minusPoint(m: SimpleMatch, team: TeamSide, now: number): SimpleMatch {
  const { setStart } = replaySimple(m)
  const i = m.rallies.lastIndexOf(team)
  if (i < setStart) return m
  return { ...m, rallies: [...m.rallies.slice(0, i), ...m.rallies.slice(i + 1)], updatedAt: now }
}

export function undoPoint(m: SimpleMatch, now: number): SimpleMatch {
  if (!m.rallies.length) return m
  return { ...m, rallies: m.rallies.slice(0, -1), updatedAt: now }
}

export function newSimpleMatch(opts: { names: Record<TeamSide, string>; format: SimpleFormat; firstServe: TeamSide; now: number; id?: string }): SimpleMatch {
  const name = (s: TeamSide) => opts.names[s].trim().slice(0, 40) || `Team ${s}`
  return {
    id: opts.id ?? `simple-${opts.now.toString(36)}`,
    names: { A: name('A'), B: name('B') },
    format: opts.format,
    firstServe: opts.firstServe,
    rallies: [],
    startedAt: opts.now,
    updatedAt: opts.now,
  }
}

/** A saved match read back from storage, or null when it isn't one. */
export function parseSimpleMatch(raw: string | null): SimpleMatch | null {
  try {
    const m = raw ? (JSON.parse(raw) as SimpleMatch) : null
    if (!m || typeof m.id !== 'string' || !m.names || !m.format || !Array.isArray(m.rallies)) return null
    if (!m.rallies.every(r => r === 'A' || r === 'B')) return null
    return m
  } catch {
    return null
  }
}
