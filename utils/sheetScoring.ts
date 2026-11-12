import { roundLabel, upNext } from './sheetScores'
import type { SheetKeepGame, SheetMatch, SheetSetPair, SheetState } from '../types'

/**
 * Scoring rules of the Google Sheet tournament app, the same as its `common.html` (targets, the
 * deciding set, the cap, win by 2, when a match is decided) and `Code.gs` (formats). Pure, so the
 * scorekeeper screen and the tests agree with the Sheet.
 */

type Rules = SheetState['settings']

const MAX_SETS: Record<string, number> = { '1set': 1, '2sets': 2, bo3: 3, bo5: 5 }
const SETS_TO_WIN: Record<string, number> = { '1set': 1, bo3: 2, bo5: 3 }
const FORMATS = ['1set', '2sets', 'bo3', 'bo5']

/** A match's own format, else the pool or bracket default from Settings. */
export function formatFor(m: Pick<SheetMatch, 'format' | 'stage'>, rules: Rules): string {
  const own = String(m.format ?? '').toLowerCase()
  if (FORMATS.includes(own)) return own
  return (m.stage === 'pool' ? rules.pool_format : rules.bracket_format) ?? 'bo3'
}

export const maxSets = (format: string) => MAX_SETS[format] ?? 3
export const setsToWin = (format: string) => SETS_TO_WIN[format] ?? 2

/** Points needed to win set `i` (0-based): the last set of a best-of uses the deciding target. */
export function setTarget(i: number, format: string, rules: Rules): number {
  const deciding = (format === 'bo3' || format === 'bo5') && i === maxSets(format) - 1
  return (deciding ? rules.deciding_set_target : rules.set_target) ?? (deciding ? 15 : 25)
}

/** True when a set is won: target reached with a 2-point lead, or the cap reached by the leader. */
export function setDone(a: number | null, b: number | null, target: number, cap?: number | null): boolean {
  if (a == null || b == null) return false
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  if (cap && hi >= cap) return hi > lo
  return hi >= target && hi - lo >= 2
}

/** No more sets needed: one set played (1set), two (2sets, ties allowed), or a team has enough sets. */
export function matchDecided(sets: SheetSetPair[], format: string, rules: Rules): boolean {
  let a = 0
  let b = 0
  let done = 0
  for (let i = 0; i < maxSets(format); i++) {
    const [x, y] = sets[i] ?? [null, null]
    if (!setDone(x, y, setTarget(i, format, rules), rules.point_cap)) break
    done++
    if ((x ?? 0) > (y ?? 0)) a++
    else b++
  }
  if (format === '1set') return done >= 1
  if (format === '2sets') return done >= 2
  return a >= setsToWin(format) || b >= setsToWin(format)
}

/** A match's sets as pairs, padded to the format's length. */
export function setsFromMatch(m: SheetMatch, format: string): SheetSetPair[] {
  const out: SheetSetPair[] = []
  for (let i = 1; i <= maxSets(format); i++) {
    const a = m[`s${i as 1 | 2 | 3 | 4 | 5}_a`]
    const b = m[`s${i as 1 | 2 | 3 | 4 | 5}_b`]
    const n = (v: unknown) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v))
    out.push([n(a), n(b)])
  }
  return out
}

/** The set being played: the last one with points, or the next one once that is won and more are needed. */
export function activeSet(sets: SheetSetPair[], format: string, rules: Rules): number {
  let last = 0
  sets.forEach(([a, b], i) => { if (a != null || b != null) last = i })
  const [a, b] = sets[last] ?? [null, null]
  if (setDone(a, b, setTarget(last, format, rules), rules.point_cap) && last + 1 < maxSets(format) && !matchDecided(sets, format, rules)) {
    return last + 1
  }
  return last
}

/** Adds (or takes back, delta -1) a point for side 0 (team A) or 1 (team B) in set `i`. Never below 0. */
export function addPoint(sets: SheetSetPair[], i: number, side: 0 | 1, delta: 1 | -1): SheetSetPair[] {
  return sets.map((pair, k) => {
    if (k !== i) return pair
    const next: SheetSetPair = [pair[0] ?? 0, pair[1] ?? 0]
    next[side] = Math.max(0, (next[side] ?? 0) + delta)
    return next
  })
}

/** Set pairs as the Sheet's submitScore wants them: blank sets sent as empty. */
export function setsPayload(sets: SheetSetPair[]): (number | '')[][] {
  return sets.map(([a, b]) => [a ?? '', b ?? ''])
}

/** Pools, then divisions with bracket games, for the scorekeeper's first choice. */
export function keepGroups(state: SheetState): { key: string; label: string; kind: 'pool' | 'bracket' }[] {
  const pools = Object.keys(state.pools).sort().map(p => ({ key: `pool:${p}`, label: `Pool ${p}`, kind: 'pool' as const }))
  const divs = new Set(state.matches.filter(m => m.stage === 'bracket' && m.group).map(m => m.group as string))
  const order = [...(state.settings.divisions ?? []).filter(d => divs.has(d)), ...[...divs].filter(d => !(state.settings.divisions ?? []).includes(d)).sort()]
  return [...pools, ...order.map(d => ({ key: `bracket:${d}`, label: d, kind: 'bracket' as const }))]
}

/**
 * The games in a group a scorekeeper can open: in play first, then ready to start (pool games in
 * the organizer's schedule order, bracket games once both teams are known), then finished.
 */
export function keepGames(state: SheetState, groupKey: string): SheetKeepGame[] {
  const [kind, group] = [groupKey.slice(0, groupKey.indexOf(':')), groupKey.slice(groupKey.indexOf(':') + 1)]
  const rows = state.matches.filter(m => m.group === group && m.stage === (kind === 'pool' ? 'pool' : 'bracket'))
  const fromRow = (m: SheetMatch): SheetKeepGame => ({
    key: m.match_id,
    matchId: m.match_id,
    pool: kind === 'pool' ? group : null,
    teamA: m.team_a ?? 'TBD',
    teamB: m.team_b ?? 'TBD',
    status: m.status === 'live' ? 'live' : m.status === 'final' ? 'final' : 'scheduled',
    court: m.court ? Number(m.court) : null,
    label: kind === 'pool' ? `Pool ${group}` : `${group} · ${roundLabel(m)}`,
  })
  const ready = (m: SheetMatch) => !!m.team_a && !!m.team_b && m.team_b !== 'BYE' && m.team_a !== 'BYE'
  const live = rows.filter(m => m.status === 'live').map(fromRow)
  const final = rows.filter(m => m.status === 'final' && ready(m)).map(fromRow)
  const toStart: SheetKeepGame[] = kind === 'pool'
    ? upNext(state, Infinity).filter(g => g.pool === group).map(g => ({
      key: `sched:${g.pool}:${g.game ?? `${g.a}-${g.b}`}`,
      matchId: null,
      pool: group,
      teamA: g.a,
      teamB: g.b,
      status: 'scheduled',
      court: g.court ? Number(g.court) || null : null,
      label: ['Pool ' + group, g.game ? `Game ${g.game}` : null, g.time].filter(Boolean).join(' · '),
    }))
    : rows.filter(m => (m.status === 'scheduled' || !m.status) && ready(m)).map(fromRow)
  return [...live, ...toStart, ...final]
}
