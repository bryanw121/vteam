import type {
  BracketMatchInsert, GeneratedSchedule, PackOptions, PackedMatch, PoolAssignInput, RoundRobinGroup, ScheduleConfig,
  ScheduleInput, ScheduleMatch, SchedulePool, SeededTeam, TimedBracketMatch,
} from '../types'
import { generateBracket } from './tournamentBracket'

/**
 * Pure schedule generator for the tournament organizer ("Generate Schedule").
 * No I/O: the screen passes registered teams + settings and saves the result.
 *
 * 1. Pools: teams are dealt in a snake by seed (unseeded teams shuffled after
 *    the seeded ones), so every pool gets a fair spread; optional "avoid" pairs
 *    are then pulled apart by swapping same-tier teams.
 * 2. Pairings: the circle method, so every pair in a pool meets exactly once.
 * 3. Time slots: matches are packed onto the courts slot by slot. A team never
 *    plays twice in one slot, and when there is a choice the packer picks
 *    matches whose teams sat out the previous slot, so teams get a break
 *    between matches instead of playing back to back.
 * 4. Ref duty: with refs on, each match gets an idle team (same pool first,
 *    fewest duties first), never one that is playing in that slot.
 * 5. Bracket-only tournaments get an elimination bracket from the seeds.
 */

/** Pool count / size for `n` teams: aims for pools of about four unless a size is given. */
export function poolLayout(n: number, teamsPerPool: number | null = null): { numPools: number; teamsPerPool: number } {
  if (n < 1) return { numPools: 0, teamsPerPool: 0 }
  if (teamsPerPool && teamsPerPool >= 2) {
    const numPools = Math.max(1, Math.ceil(n / teamsPerPool))
    return { numPools, teamsPerPool: Math.ceil(n / numPools) }
  }
  const size = Math.ceil(n / Math.max(1, Math.round(n / 4)))
  return { numPools: Math.ceil(n / size), teamsPerPool: size }
}

/** Fisher-Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Order-independent key for a pair of team ids. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** Seeded teams by seed (ties by list order), then unseeded teams in list order. */
export function seededOrder(teams: readonly SeededTeam[]): string[] {
  const indexed = teams.map((t, i) => ({ t, i }))
  const seeded = indexed.filter(x => x.t.seed !== null).sort((x, y) => (x.t.seed as number) - (y.t.seed as number) || x.i - y.i)
  const rest = indexed.filter(x => x.t.seed === null)
  return [...seeded, ...rest].map(x => x.t.id)
}

function poolCost(pools: readonly string[][], avoid: ReadonlyMap<string, number>): number {
  let cost = 0
  for (const pool of pools) {
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) cost += avoid.get(pairKey(pool[i], pool[j])) ?? 0
    }
  }
  return cost
}

/**
 * Deal teams into `numPools` pools: snake order by seed (1st, 2nd, ... then back),
 * unseeded teams shuffled after the seeded ones. Pool sizes differ by at most one.
 */
export function assignPools({ teams, numPools, random = Math.random, avoid }: PoolAssignInput): string[][] {
  const count = Math.max(1, Math.min(numPools, teams.length))
  const seeded = seededOrder(teams.filter(t => t.seed !== null))
  const unseeded = shuffle(teams.filter(t => t.seed === null).map(t => t.id), random)
  const order = [...seeded, ...unseeded]
  const pools: string[][] = Array.from({ length: count }, () => [])
  const tier = new Map<string, number>()
  order.forEach((id, i) => {
    const row = Math.floor(i / count)
    const col = i % count
    pools[row % 2 === 0 ? col : count - 1 - col].push(id)
    tier.set(id, row)
  })

  if (!avoid || avoid.size === 0 || count < 2) return pools

  // Local search: swap two same-tier teams in different pools while it lowers the cost.
  let cost = poolCost(pools, avoid)
  for (let pass = 0; pass < 50 && cost > 0; pass++) {
    let improved = false
    for (let p = 0; p < count; p++) {
      for (let q = p + 1; q < count; q++) {
        for (let i = 0; i < pools[p].length; i++) {
          for (let j = 0; j < pools[q].length; j++) {
            if (tier.get(pools[p][i]) !== tier.get(pools[q][j])) continue
            ;[pools[p][i], pools[q][j]] = [pools[q][j], pools[p][i]]
            const next = poolCost(pools, avoid)
            if (next < cost) { cost = next; improved = true } else [pools[p][i], pools[q][j]] = [pools[q][j], pools[p][i]]
          }
        }
      }
    }
    if (!improved) break
  }
  return pools
}

/**
 * Round-robin rounds via the circle method: `n - 1` rounds for even `n`, `n` rounds
 * for odd `n` (one bye each). Every pair meets exactly once across all rounds.
 */
export function roundRobinRounds(teamIds: readonly string[]): [string, string][][] {
  if (teamIds.length < 2) return []
  const ring: (string | null)[] = teamIds.length % 2 === 1 ? [...teamIds, null] : [...teamIds]
  const n = ring.length
  const rounds: [string, string][][] = []
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = ring[i]
      const b = ring[n - 1 - i]
      if (a !== null && b !== null) pairs.push([a, b])
    }
    rounds.push(pairs)
    // Rotate everything but the first seat one step.
    ring.splice(1, 0, ring.pop() as string | null)
  }
  return rounds
}

/**
 * Pack round-robin matches into time slots on `numCourts` courts.
 *
 * Each slot takes matches from the earliest unfinished round (and the next one,
 * so a slot is not left half empty), preferring matches whose teams did not play
 * in the previous slot. A team plays at most once per slot. With `rest`, a team
 * never plays two slots in a row unless nothing else could be played (courts may
 * then sit idle: a longer day in exchange for a break after every match).
 */
export function packRoundRobin(groups: readonly RoundRobinGroup[], opts: PackOptions): PackedMatch[] {
  const numCourts = Math.max(1, Math.floor(opts.numCourts) || 1)
  type Pending = { poolKey: string | null; round: number; a: string; b: string; order: number }
  const pending: Pending[] = groups
    .flatMap((g, gi) => g.rounds.flatMap((pairs, r) => pairs.map(([a, b], pos) => ({ poolKey: g.poolKey, round: r + 1, a, b, gi, pos }))))
    .sort((x, y) => x.round - y.round || x.gi - y.gi || x.pos - y.pos)
    .map((m, order) => ({ poolKey: m.poolKey, round: m.round, a: m.a, b: m.b, order }))

  const lastPlayed = new Map<string, number>()
  const out: PackedMatch[] = []
  for (let slot = 0; pending.length > 0; slot++) {
    const minRound = Math.min(...pending.map(p => p.round))
    const tired = (p: Pending) => Number(lastPlayed.get(p.a) === slot - 1) + Number(lastPlayed.get(p.b) === slot - 1)
    const window = pending
      .filter(p => p.round <= minRound + 1)
      .sort((x, y) => tired(x) - tired(y) || x.round - y.round || x.order - y.order)
    // With guaranteed rest, only teams that sat out the last slot may play; if that
    // leaves nothing to play at all, fall back to the best available set.
    const rested = opts.rest ? bestSlot(window.filter(p => tired(p) === 0), numCourts, tired) : []
    const chosen = rested.length > 0 ? rested : bestSlot(window, numCourts, tired)
    chosen.sort((x, y) => x.order - y.order).forEach((p, court) => {
      pending.splice(pending.indexOf(p), 1)
      lastPlayed.set(p.a, slot)
      lastPlayed.set(p.b, slot)
      out.push({ poolKey: p.poolKey, round: p.round, teamA: p.a, teamB: p.b, slot, court, refTeamId: null })
    })
  }

  if (opts.refs) assignRefs(out, groups)
  return out
}

/**
 * The set of matches for one slot: as many as fit (up to the court count, no team
 * twice), then the fewest teams coming straight off the previous slot, then the
 * earliest rounds. A bounded depth-first search; `window` is already sorted by
 * preference, so the first complete set found is a good fallback.
 */
function bestSlot<T extends { a: string; b: string; round: number }>(window: readonly T[], courts: number, tired: (m: T) => number): T[] {
  let best: T[] = []
  let bestCost = [Infinity, Infinity]
  let visits = 0
  const better = (set: T[], cost: number[]) =>
    set.length > best.length || (set.length === best.length && (cost[0] < bestCost[0] || (cost[0] === bestCost[0] && cost[1] < bestCost[1])))
  const busy = new Set<string>()
  const picked: T[] = []
  function dfs(start: number, tiredSum: number, roundSum: number) {
    if (++visits > 20_000) return
    if (better(picked, [tiredSum, roundSum])) { best = [...picked]; bestCost = [tiredSum, roundSum] }
    if (picked.length === courts) return
    // Not enough candidates left to beat the best size: stop.
    if (picked.length + (window.length - start) < best.length) return
    for (let i = start; i < window.length; i++) {
      const m = window[i]
      if (busy.has(m.a) || busy.has(m.b)) continue
      picked.push(m); busy.add(m.a); busy.add(m.b)
      dfs(i + 1, tiredSum + tired(m), roundSum + m.round)
      picked.pop(); busy.delete(m.a); busy.delete(m.b)
    }
  }
  dfs(0, 0, 0)
  return best
}

/** Give each match an idle referee team: same pool first, then fewest duties, then not reffing twice in a row. */
function assignRefs(matches: PackedMatch[], groups: readonly RoundRobinGroup[]): void {
  const poolOf = new Map<string, string | null>()
  const allTeams: string[] = []
  for (const g of groups) for (const id of g.teamIds) { poolOf.set(id, g.poolKey); allTeams.push(id) }
  const duties = new Map<string, number>(allTeams.map(id => [id, 0]))
  const slots = [...new Set(matches.map(m => m.slot))].sort((a, b) => a - b)
  let prevRefs = new Set<string>()

  for (const slot of slots) {
    const inSlot = matches.filter(m => m.slot === slot)
    const playing = new Set(inSlot.flatMap(m => [m.teamA, m.teamB]))
    const reffing = new Set<string>()
    for (const m of inSlot) {
      const candidates = allTeams.filter(id => !playing.has(id) && !reffing.has(id))
      if (candidates.length === 0) continue
      const score = (id: string) => [
        poolOf.get(id) === m.poolKey ? 0 : 1,
        duties.get(id) ?? 0,
        prevRefs.has(id) ? 1 : 0,
      ]
      candidates.sort((x, y) => {
        const sx = score(x)
        const sy = score(y)
        return sx[0] - sy[0] || sx[1] - sy[1] || sx[2] - sy[2]
      })
      const ref = candidates[0]
      m.refTeamId = ref
      reffing.add(ref)
      duties.set(ref, (duties.get(ref) ?? 0) + 1)
    }
    prevRefs = reffing
  }
}

export function courtLabel(court: number, numCourts: number): string {
  return numCourts > 1 ? `Court ${court + 1}` : 'Main Court'
}

const slotLength = (config: Pick<ScheduleConfig, 'matchDuration' | 'breakDuration'>) =>
  (config.matchDuration + config.breakDuration) * 60_000

/** Give bracket rows times and courts: wave by wave, as many per slot as there are courts. */
export function scheduleBracket(rows: readonly BracketMatchInsert[], startDate: Date, config: ScheduleConfig): TimedBracketMatch[] {
  const numCourts = Math.max(1, Math.floor(config.numCourts) || 1)
  const slotMs = slotLength(config)
  const byWave = new Map<number, BracketMatchInsert[]>()
  for (const r of rows) byWave.set(r.wave, [...(byWave.get(r.wave) ?? []), r])
  const out: TimedBracketMatch[] = []
  let slot = 0
  for (const wave of [...byWave.keys()].sort((a, b) => a - b)) {
    const list = byWave.get(wave) ?? []
    list.forEach((r, i) => {
      out.push({
        ...r,
        court: courtLabel(i % numCourts, numCourts),
        scheduled_at: new Date(startDate.getTime() + (slot + Math.floor(i / numCourts)) * slotMs).toISOString(),
        status: 'scheduled',
      })
    })
    slot += Math.ceil(list.length / numCourts)
  }
  return out
}

/** When the next stage can start: one slot after the last scheduled match (or `fallback`). */
export function nextStageStart(scheduledAts: readonly (string | null)[], config: ScheduleConfig, fallback: Date): Date {
  const times = scheduledAts.filter((t): t is string => !!t).map(t => new Date(t).getTime())
  if (times.length === 0) return fallback
  return new Date(Math.max(...times) + slotLength(config))
}

export function generateSchedule(input: ScheduleInput): GeneratedSchedule {
  const { format, startDate, teamIds, config } = input
  if (teamIds.length < 2) return { pools: [], matches: [], bracket: [] }
  const teams: SeededTeam[] = teamIds.map(id => ({ id, seed: input.seeds?.[id] ?? null }))

  if (format === 'bracket') {
    const rows = generateBracket(seededOrder(teams), input.bracketType ?? 'single', !!input.thirdPlace)
    return { pools: [], matches: [], bracket: scheduleBracket(rows, startDate, config) }
  }

  const random = input.random ?? Math.random
  const usePools = format === 'pool_play' || format === 'pool_bracket'
  const numCourts = Math.max(1, Math.floor(config.numCourts) || 1)
  const cap = config.gamesPerTeam && config.gamesPerTeam > 0 ? config.gamesPerTeam : null

  const pools: SchedulePool[] = []
  const groups: RoundRobinGroup[] = []
  if (usePools) {
    const { numPools } = poolLayout(teamIds.length, config.teamsPerPool)
    assignPools({ teams, numPools, random, avoid: input.avoid }).forEach((members, i) => {
      const key = String.fromCharCode(65 + i)
      pools.push({ key, name: `Pool ${key}`, display_order: i, team_ids: members })
      groups.push({ poolKey: key, teamIds: members, rounds: roundRobinRounds(members) })
    })
  } else {
    groups.push({ poolKey: null, teamIds, rounds: roundRobinRounds(teamIds) })
  }

  // "Games per team" = opponents faced: each round is one game per team, so keep the first N rounds.
  if (cap) groups.forEach(g => { g.rounds = g.rounds.slice(0, cap) })

  const stage: ScheduleMatch['stage'] = usePools ? 'pool_play' : 'round_robin'
  const slotMs = slotLength(config)
  const packed = packRoundRobin(groups, { numCourts, refs: !!input.refs, rest: config.restBetweenMatches })
    .sort((x, y) => x.slot - y.slot || x.court - y.court)

  // `round` is the time slot and `match_number` a running number, so sorting by
  // (round, match_number) is chronological and (stage, match_number) is unique.
  const matches: ScheduleMatch[] = packed.map((p, i) => ({
    pool_key: p.poolKey,
    stage,
    round: p.slot + 1,
    match_number: i + 1,
    team_a_id: p.teamA,
    team_b_id: p.teamB,
    court: courtLabel(p.court, numCourts),
    scheduled_at: new Date(startDate.getTime() + p.slot * slotMs).toISOString(),
    status: 'scheduled',
    ref_team_id: p.refTeamId,
  }))

  return { pools, matches, bracket: [] }
}
