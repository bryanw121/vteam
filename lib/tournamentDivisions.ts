import type { DivisionProblem, DivisionRule, DivisionSeeding, DivisionSize, StandingRow } from '../types'
import { nextPow2 } from './tournamentBracket'
import { crossPoolCompare } from './tournamentStandings'

/**
 * Divisions: pure rules, no I/O.
 *
 * A division is one bracket fed by where teams finish in their pool: with pools of 7,
 * Platinum takes 1st, Gold 2nd–3rd, Silver 4th–5th, Bronze 6th–7th. A tournament has
 * one or more. One division taking the top N is the classic "top N advance"; finishes
 * below the last division are out after pool play.
 */

const NAMES: Record<number, readonly string[]> = {
  1: ['Championship'],
  2: ['Gold', 'Silver'],
  3: ['Gold', 'Silver', 'Bronze'],
  4: ['Platinum', 'Gold', 'Silver', 'Bronze'],
}

/** Hosts can add more, but a pool can't feed more divisions than it has finishes. */
export const MAX_DIVISIONS = 8

/**
 * A sensible starting split of `teamsPerPool` finishes into `count` divisions. One division
 * takes the top half (rounded up); more share every finish, the lower divisions taking the
 * extra places, so the top bracket is the smallest (7 finishes into 4: 1 / 2 / 2 / 2).
 */
export function defaultDivisions(count: number, teamsPerPool: number): DivisionRule[] {
  const n = Math.max(1, Math.min(Math.floor(count), MAX_DIVISIONS, Math.max(1, teamsPerPool)))
  const names = NAMES[n] ?? Array.from({ length: n }, (_, i) => `Division ${i + 1}`)
  const sizes = n === 1
    ? [Math.max(1, Math.ceil(teamsPerPool / 2))]
    : Array.from({ length: n }, (_, i) => Math.floor(teamsPerPool / n) + (i >= n - (teamsPerPool % n) ? 1 : 0))
  let from = 1
  return sizes.map((size, i) => {
    const rule = { key: `d${i + 1}`, name: names[i], fromPlace: from, toPlace: from + size - 1 }
    from += size
    return rule
  })
}

/**
 * The first thing wrong with a set of divisions, or `none`. In order, top division first:
 * every division has a name and at least one finish, no finish is used twice, none is
 * skipped between divisions, and none is beyond the pool. Finishes after the last division
 * are fine: those teams are out after pools.
 */
export function divisionProblem(rules: readonly DivisionRule[], teamsPerPool: number): DivisionProblem {
  let next = 1
  for (const r of rules) {
    if (!r.name.trim()) return { kind: 'unnamed', key: r.key }
    if (r.toPlace < r.fromPlace) return { kind: 'empty', key: r.key }
    if (r.fromPlace < next) return { kind: 'overlap', key: r.key, place: r.fromPlace }
    if (r.fromPlace > next) return { kind: 'gap', place: next }
    if (r.toPlace > teamsPerPool) return { kind: 'out_of_range', key: r.key, place: r.toPlace }
    next = r.toPlace + 1
  }
  return { kind: 'none' }
}

/** Finishes no division takes (out after pools), or null when every finish is placed. */
export function finishesOut(rules: readonly DivisionRule[], teamsPerPool: number): { fromPlace: number; toPlace: number } | null {
  const last = rules.reduce((max, r) => Math.max(max, r.toPlace), 0)
  return last < teamsPerPool ? { fromPlace: last + 1, toPlace: teamsPerPool } : null
}

/** Teams each division gets from pools of these sizes (a short pool sends fewer), with its bracket size and byes. */
export function divisionSizes(rules: readonly DivisionRule[], poolSizes: readonly number[]): DivisionSize[] {
  return rules.map(r => {
    const teams = poolSizes.reduce((sum, size) => sum + Math.max(0, Math.min(r.toPlace, size) - r.fromPlace + 1), 0)
    const bracketSize = teams < 2 ? teams : nextPow2(teams)
    return { key: r.key, teams, bracketSize, byes: bracketSize - teams }
  })
}

/**
 * Bracket seeds for every division from the final pool tables: within a division, every
 * pool's best finisher first (best record first), then the next finish, and so on.
 * A team that shares a rank still takes the table position it was listed in.
 */
export function seedDivisions(
  pools: readonly { poolKey: string; rows: readonly StandingRow[] }[],
  rules: readonly DivisionRule[],
): DivisionSeeding[] {
  return rules.map(r => {
    const seeds: string[] = []
    const placeOf = new Map<string, number>()
    for (let place = r.fromPlace; place <= r.toPlace; place++) {
      const tier = pools.map(p => p.rows[place - 1]).filter((row): row is StandingRow => !!row)
      tier.sort(crossPoolCompare)
      for (const row of tier) {
        seeds.push(row.teamId)
        placeOf.set(row.teamId, place)
      }
    }
    return { key: r.key, seeds, placeOf }
  })
}
