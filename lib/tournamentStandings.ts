import type { Podium, StandingMatch, StandingRow, TiebreakerKey } from '../types'
import { seedOrder, nextPow2 } from './tournamentBracket'

/**
 * Pure standings, seeding and podium helpers: no I/O.
 *
 * Teams rank by wins (a tied match counts half a win), then by the host's tiebreakers in order. Head-to-head
 * counts wins among exactly the teams still tied, so a three-way tie uses the
 * mini table of those three. Teams level on every tiebreaker share a rank
 * (that is how a tie for third happens).
 */

export const DEFAULT_TIEBREAKERS: readonly TiebreakerKey[] = ['head_to_head', 'set_ratio', 'point_diff', 'points_for']

/** Sets each side won, from the set scores. */
function setsWonBy(m: StandingMatch): [number, number] {
  let a = 0
  let b = 0
  for (const s of m.sets) {
    if (s.team_a_score > s.team_b_score) a++
    else if (s.team_b_score > s.team_a_score) b++
  }
  return [a, b]
}

const finished = (m: StandingMatch) =>
  !!m.team_a_id && !!m.team_b_id && (m.status === 'completed' || m.status === 'forfeit')

/** A finished match with no winner whose sets were split evenly (two-set pool play, 1–1). */
export function isTie(m: StandingMatch): boolean {
  if (!finished(m) || m.winner_id) return false
  const [a, b] = setsWonBy(m)
  return a > 0 && a === b
}

const counted = (m: StandingMatch) => finished(m) && (!!m.winner_id || isTie(m))

type Totals = Omit<StandingRow, 'rank' | 'tied'> & { ties: number }

function totals(teamIds: readonly string[], matches: readonly StandingMatch[]): Map<string, Totals> {
  const t = new Map<string, Totals>(teamIds.map(id => [id, {
    teamId: id, played: 0, wins: 0, losses: 0, ties: 0, setsWon: 0, setsLost: 0, pointsFor: 0, pointsAgainst: 0,
  }]))
  for (const m of matches) {
    if (!counted(m)) continue
    const a = t.get(m.team_a_id as string)
    const b = t.get(m.team_b_id as string)
    if (!a || !b) continue
    a.played++; b.played++
    if (!m.winner_id) { a.ties++; b.ties++ }
    else if (m.winner_id === m.team_a_id) { a.wins++; b.losses++ } else { b.wins++; a.losses++ }
    for (const s of m.sets) {
      a.pointsFor += s.team_a_score; a.pointsAgainst += s.team_b_score
      b.pointsFor += s.team_b_score; b.pointsAgainst += s.team_a_score
      if (s.team_a_score > s.team_b_score) { a.setsWon++; b.setsLost++ } else if (s.team_b_score > s.team_a_score) { b.setsWon++; a.setsLost++ }
    }
  }
  return t
}

/** Match points: a win is 1, a tie is half. Equal to wins where ties can't happen. */
const matchPoints = (r: { wins: number; ties?: number }) => r.wins + (r.ties ?? 0) / 2

const setRatio = (r: Totals) => (r.setsWon + r.setsLost === 0 ? 0 : r.setsWon / (r.setsWon + r.setsLost))

function tiebreakValue(key: TiebreakerKey, row: Totals, group: ReadonlySet<string>, matches: readonly StandingMatch[]): number {
  switch (key) {
    case 'head_to_head':
      return matches
        .filter(m => counted(m) && group.has(m.team_a_id as string) && group.has(m.team_b_id as string)
          && (m.team_a_id === row.teamId || m.team_b_id === row.teamId))
        .reduce((sum, m) => sum + (m.winner_id === row.teamId ? 1 : m.winner_id ? 0 : 0.5), 0)
    case 'set_ratio': return setRatio(row)
    case 'point_diff': return row.pointsFor - row.pointsAgainst
    case 'points_for': return row.pointsFor
  }
}

/** Split a group into ordered subgroups of equal value (higher first). */
function splitBy(group: Totals[], value: (r: Totals) => number): Totals[][] {
  const sorted = [...group].sort((x, y) => value(y) - value(x))
  const out: Totals[][] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && value(last[0]) === value(r)) last.push(r)
    else out.push([r])
  }
  return out
}

/**
 * Rank `teamIds` on `matches` (only completed or forfeited matches between two
 * listed teams count). `teamIds` order (e.g. by seed) breaks full ties for
 * display only; tied teams keep the same rank.
 */
export function computeStandings(
  teamIds: readonly string[],
  matches: readonly StandingMatch[],
  tiebreakers: readonly TiebreakerKey[] = DEFAULT_TIEBREAKERS,
): StandingRow[] {
  const t = totals(teamIds, matches)
  const position = new Map(teamIds.map((id, i) => [id, i]))

  function order(group: Totals[], remaining: readonly TiebreakerKey[]): Totals[][] {
    if (group.length < 2 || remaining.length === 0) return [group]
    const [key, ...rest] = remaining
    const ids = new Set(group.map(r => r.teamId))
    const parts = splitBy(group, r => tiebreakValue(key, r, ids, matches))
    // Head-to-head that separates nobody: move on to the next tiebreaker.
    if (parts.length === 1) return order(group, rest)
    return parts.flatMap(p => order(p, key === 'head_to_head' ? remaining : rest))
  }

  const tiers = splitBy([...t.values()], matchPoints).flatMap(g => order(g, tiebreakers))
  const anyTies = [...t.values()].some(r => r.ties > 0)
  const rows: StandingRow[] = []
  for (const tier of tiers) {
    const rank = rows.length + 1
    tier.sort((x, y) => (position.get(x.teamId) ?? 0) - (position.get(y.teamId) ?? 0))
    for (const r of tier) {
      const { ties, ...rest } = r
      // `ties` appears only in tables that have one, so tables without ties are unchanged.
      rows.push(anyTies ? { ...rest, ties, rank, tied: tier.length > 1 } : { ...rest, rank, tied: tier.length > 1 })
    }
  }
  return rows
}

/** Podium from a final table: top three ranks, with any teams tied on third sharing it. */
export function standingsPodium(rows: readonly StandingRow[]): Podium {
  // A shared first or second place is rare; table order decides it, and the rest move down.
  const thirdRank = rows[2]?.rank
  return {
    first: rows[0]?.teamId ?? null,
    second: rows[1]?.teamId ?? null,
    thirds: thirdRank === undefined ? [] : rows.filter((r, i) => i >= 2 && r.rank === thirdRank).map(r => r.teamId),
  }
}

/** Order for comparing teams from pools of different sizes: win rate, then the same tiebreakers. */
export function crossPoolCompare(a: StandingRow, b: StandingRow): number {
  const rate = (r: StandingRow) => (r.played === 0 ? 0 : matchPoints(r) / r.played)
  return rate(b) - rate(a)
    || (b.setsWon + b.setsLost === 0 ? 0 : b.setsWon / (b.setsWon + b.setsLost)) - (a.setsWon + a.setsLost === 0 ? 0 : a.setsWon / (a.setsWon + a.setsLost))
    || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
}

/**
 * Bracket seeds from pool tables: every pool's winner first (best record first),
 * then every runner-up, and so on, `perPool` teams from each pool.
 */
export function seedsFromPools(pools: readonly { poolKey: string; rows: readonly StandingRow[] }[], perPool: number): string[] {
  const seeds: string[] = []
  for (let place = 0; place < perPool; place++) {
    const tier = pools.map(p => p.rows[place]).filter((r): r is StandingRow => !!r)
    tier.sort(crossPoolCompare)
    seeds.push(...tier.map(r => r.teamId))
  }
  return seeds
}

/**
 * Reorder seeds so first-round bracket matches avoid two teams from the same
 * pool (they already played). Only teams that finished in the same place in
 * their pools swap, so a pool winner is never pushed below a runner-up.
 * `tierOf` gives each seed's finishing place; returns a new array.
 */
export function avoidPoolRematches(
  seeds: readonly string[],
  poolOf: ReadonlyMap<string, string>,
  tierOf: ReadonlyMap<string, number>,
): string[] {
  const out = [...seeds]
  const n = out.length
  const order = seedOrder(nextPow2(n))
  const opponent = new Map<number, number>()   // seed index -> first-round opponent index
  for (let i = 0; i < order.length; i += 2) {
    const a = order[i] - 1
    const b = order[i + 1] - 1
    if (a < n && b < n) { opponent.set(a, b); opponent.set(b, a) }
  }
  const clash = (i: number) => {
    const o = opponent.get(i)
    return o !== undefined && poolOf.get(out[i]) === poolOf.get(out[o])
  }
  const clashes = () => [...opponent.keys()].filter(clash).length

  // The lower seed of each clashing pair looks for a same-tier swap that lowers the clash count.
  for (let pass = 0; pass < n; pass++) {
    let improved = false
    for (let i = 0; i < n; i++) {
      const o = opponent.get(i)
      if (o === undefined || o > i || !clash(i)) continue
      const before = clashes()
      for (let j = 0; j < n; j++) {
        if (j === i || tierOf.get(out[j]) !== tierOf.get(out[i])) continue
        ;[out[i], out[j]] = [out[j], out[i]]
        if (clashes() < before) { improved = true; break }
        ;[out[i], out[j]] = [out[j], out[i]]
      }
    }
    if (!improved) break
  }
  return out
}
