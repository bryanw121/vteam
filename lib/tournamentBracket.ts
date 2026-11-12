import type {
  BracketAdvance, BracketLink, BracketMatchInsert, BracketNode, BracketNodeState, BracketPlan, BracketSlot,
  BracketSource, Podium, TournamentBracketType,
} from '../types'

/**
 * Pure elimination-bracket engine: no I/O.
 *
 * A bracket is planned at the next power of two (`size`) with the standard seed
 * order (1 v 16, 8 v 9, ...). With fewer teams the missing seeds are byes: a
 * match position that can only ever receive one team is a "pass" node, so that
 * team moves straight on and no match row is stored for it. Only "live" nodes
 * (two real teams will meet) become rows, which is why advancement can rebuild
 * the plan from the stored rows alone: a missing row on the way is a pass node.
 *
 * Row mapping: winners-bracket node `W<r>-<n>` is round r, match_number n,
 * is_losers_bracket false; `L<r>-<n>` the same with is_losers_bracket true; the
 * grand final `GF` is round rounds+1, match 1; the third-place match `TP` is the
 * final's round, match 2 (the final is always match 1).
 */

export function nextPow2(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

/** Standard bracket seed order for a power-of-two size: [1, 8, 4, 5, 2, 7, 3, 6] for 8. */
export function seedOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const m = order.length * 2
    order = order.flatMap(s => [s, m + 1 - s])
  }
  return order
}

function winnersRoundName(round: number, rounds: number, size: number, type: TournamentBracketType): string {
  if (round === rounds) return type === 'double' ? 'Winners final' : 'Final'
  if (round === rounds - 1) return 'Semifinal'
  if (round === rounds - 2) return 'Quarterfinal'
  return `Round of ${size / 2 ** (round - 1)}`
}

const W = (r: number, m: number) => `W${r}-${m}`
const L = (r: number, m: number) => `L${r}-${m}`

/** Build the full bracket structure (every position, before byes are applied). */
export function planBracket(teamCount: number, type: TournamentBracketType = 'single', thirdPlace = false): BracketPlan {
  const size = nextPow2(Math.max(2, teamCount))
  const rounds = Math.log2(size)
  const nodes: Record<string, BracketNode> = {}
  const add = (key: string, side: BracketNode['side'], round: number, match: number, name: string, sources: [BracketSource, BracketSource]) => {
    nodes[key] = { key, side, round, match, name, sources, winnerTo: null, loserTo: null }
  }

  // Winners (or the only) bracket.
  const order = seedOrder(size)
  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r
    for (let m = 1; m <= count; m++) {
      const sources: [BracketSource, BracketSource] = r === 1
        ? [{ kind: 'seed', seed: order[2 * m - 2] }, { kind: 'seed', seed: order[2 * m - 1] }]
        : [{ kind: 'winner', node: W(r - 1, 2 * m - 1) }, { kind: 'winner', node: W(r - 1, 2 * m) }]
      add(W(r, m), 'W', r, m, winnersRoundName(r, rounds, size, type), sources)
    }
  }

  if (type === 'single' && thirdPlace && rounds >= 2) {
    add('TP', 'TP', rounds, 2, 'Third place', [
      { kind: 'loser', node: W(rounds - 1, 1) },
      { kind: 'loser', node: W(rounds - 1, 2) },
    ])
  }

  if (type === 'double') {
    // Losers bracket: 2(rounds - 1) rounds. Odd rounds pair up survivors (round 1:
    // the winners-bracket round-1 losers); even rounds bring in the losers of the
    // next winners round, in alternating order so early rematches are less likely.
    const lbRounds = 2 * (rounds - 1)
    for (let lr = 1; lr <= lbRounds; lr++) {
      const isLast = lr === lbRounds
      const name = isLast ? 'Losers final' : `Losers round ${lr}`
      if (lr === 1) {
        for (let m = 1; m <= size / 4; m++) {
          add(L(1, m), 'L', 1, m, name, [{ kind: 'loser', node: W(1, 2 * m - 1) }, { kind: 'loser', node: W(1, 2 * m) }])
        }
      } else if (lr % 2 === 0) {
        const j = lr / 2
        const count = size / 2 ** (j + 1)
        for (let m = 1; m <= count; m++) {
          const wbMatch = j % 2 === 1 ? count + 1 - m : m
          add(L(lr, m), 'L', lr, m, name, [{ kind: 'winner', node: L(lr - 1, m) }, { kind: 'loser', node: W(j + 1, wbMatch) }])
        }
      } else {
        const j = (lr - 1) / 2
        const count = size / 2 ** (j + 2)
        for (let m = 1; m <= count; m++) {
          add(L(lr, m), 'L', lr, m, name, [{ kind: 'winner', node: L(lr - 1, 2 * m - 1) }, { kind: 'winner', node: L(lr - 1, 2 * m) }])
        }
      }
    }
    const lbChampion: BracketSource = lbRounds > 0
      ? { kind: 'winner', node: L(lbRounds, 1) }
      : { kind: 'loser', node: W(rounds, 1) }   // two teams: the final's loser gets a second chance
    add('GF', 'GF', rounds + 1, 1, 'Grand final', [{ kind: 'winner', node: W(rounds, 1) }, lbChampion])
  }

  // Inverse links: where each node's winner and loser go.
  for (const node of Object.values(nodes)) {
    node.sources.forEach((src, i) => {
      if (src.kind === 'seed') return
      const link: BracketLink = { node: node.key, slot: i === 0 ? 'a' : 'b' }
      if (src.kind === 'winner') nodes[src.node].winnerTo = link
      else nodes[src.node].loserTo = link
    })
  }

  return { type, size, rounds, thirdPlace: !!nodes.TP, nodes }
}

/** Whether a source can ever deliver a team, given the node states so far. */
function sourceFilled(src: BracketSource, teamCount: number, stateOf: (key: string) => BracketNodeState): boolean {
  if (src.kind === 'seed') return src.seed <= teamCount
  const s = stateOf(src.node)
  return src.kind === 'winner' ? s !== 'dead' : s === 'live'
}

/** Which nodes are played, passed through (a bye) or never reached, for `teamCount` teams. */
export function nodeStates(plan: BracketPlan, teamCount: number): Record<string, BracketNodeState> {
  const states: Record<string, BracketNodeState> = {}
  function stateOf(key: string): BracketNodeState {
    if (states[key]) return states[key]
    const filled = plan.nodes[key].sources.filter(s => sourceFilled(s, teamCount, stateOf)).length
    states[key] = filled === 2 ? 'live' : filled === 1 ? 'pass' : 'dead'
    return states[key]
  }
  Object.keys(plan.nodes).forEach(stateOf)
  return states
}

/** Play order: one more than the latest source match (seeds are wave 0). Pass nodes add no wave. */
function waves(plan: BracketPlan, states: Record<string, BracketNodeState>): Record<string, number> {
  const memo: Record<string, number> = {}
  function waveOf(key: string): number {
    if (memo[key] !== undefined) return memo[key]
    const before = Math.max(0, ...plan.nodes[key].sources.map(s => (s.kind === 'seed' ? 0 : waveOf(s.node))))
    memo[key] = states[key] === 'live' ? before + 1 : before
    return memo[key]
  }
  Object.keys(plan.nodes).forEach(waveOf)
  return memo
}

/**
 * The bracket's match rows for teams in seed order (index 0 = seed 1). Byes are
 * resolved: a top seed without a first-round opponent is already placed in its
 * second-round match.
 */
export function generateBracket(seededTeamIds: readonly string[], type: TournamentBracketType = 'single', thirdPlace = false): BracketMatchInsert[] {
  const n = seededTeamIds.length
  if (n < 2) return []
  const plan = planBracket(n, type, thirdPlace)
  const states = nodeStates(plan, n)
  const wave = waves(plan, states)

  // The team a source is already known to deliver (only through byes), else null.
  function resolve(src: BracketSource): string | null {
    if (src.kind === 'seed') return seededTeamIds[src.seed - 1] ?? null
    if (states[src.node] !== 'pass' || src.kind === 'loser') return null
    const only = plan.nodes[src.node].sources.find(s => sourceFilled(s, n, k => states[k]))
    return only ? resolve(only) : null
  }

  return Object.values(plan.nodes)
    .filter(node => states[node.key] === 'live')
    .map(node => ({
      key: node.key,
      stage: 'bracket' as const,
      round: node.round,
      match_number: node.match,
      is_losers_bracket: node.side === 'L',
      bracket_round_name: node.name,
      team_a_id: resolve(node.sources[0]),
      team_b_id: resolve(node.sources[1]),
      wave: wave[node.key],
    }))
    .sort((x, y) => x.wave - y.wave || Number(x.is_losers_bracket) - Number(y.is_losers_bracket) || x.round - y.round || x.match_number - y.match_number)
}

// ─── Stored rows → plan ──────────────────────────────────────────────────────

/** The parts of a stored bracket match the engine reads. */
export type BracketRow = {
  id: string
  round: number
  match_number: number
  is_losers_bracket: boolean
  team_a_id: string | null
  team_b_id: string | null
  winner_id: string | null
  status: string
}

/** A stored row's node key, given the plan's winners-round count. */
export function rowKey(row: Pick<BracketRow, 'round' | 'match_number' | 'is_losers_bracket'>, plan: Pick<BracketPlan, 'type' | 'rounds'>): string {
  if (row.is_losers_bracket) return L(row.round, row.match_number)
  if (plan.type === 'double' && row.round === plan.rounds + 1) return 'GF'
  if (plan.type === 'single' && row.round === plan.rounds && row.match_number === 2) return 'TP'
  return W(row.round, row.match_number)
}

/** Rebuild the plan for stored rows: size from the deepest winners round, third place from its row. */
export function planFromRows(rows: readonly BracketRow[], type: TournamentBracketType): BracketPlan | null {
  const winners = rows.filter(r => !r.is_losers_bracket)
  if (winners.length === 0) return null
  const maxRound = Math.max(...winners.map(r => r.round))
  const rounds = type === 'double' ? Math.max(1, maxRound - 1) : maxRound
  const thirdPlace = type === 'single' && winners.some(r => r.round === rounds && r.match_number === 2)
  return planBracket(2 ** rounds, type, thirdPlace)
}

export function keyedRows<R extends BracketRow>(rows: readonly R[], plan: BracketPlan): Map<string, R> {
  return new Map(rows.map(r => [rowKey(r, plan), r]))
}

/** Follow a link, skipping pass nodes (no stored row) until a stored match or the end. */
function landing(plan: BracketPlan, stored: ReadonlySet<string>, link: BracketLink | null): BracketLink | null {
  let at = link
  while (at && !stored.has(at.node)) at = plan.nodes[at.node]?.winnerTo ?? null
  return at
}

/**
 * The slot writes a recorded result causes: the winner moves on, and (double
 * elimination / third-place match) the loser drops down. Re-recording a result
 * overwrites the same slots, so a corrected winner replaces the old one.
 */
export function advanceFrom(plan: BracketPlan, storedKeys: ReadonlySet<string>, key: string, winnerId: string, loserId: string | null): BracketAdvance[] {
  const node = plan.nodes[key]
  if (!node) return []
  const out: BracketAdvance[] = []
  const w = landing(plan, storedKeys, node.winnerTo)
  if (w) out.push({ key: w.node, slot: w.slot, teamId: winnerId })
  const l = loserId ? landing(plan, storedKeys, node.loserTo) : null
  if (l && loserId) out.push({ key: l.node, slot: l.slot, teamId: loserId })
  return out
}

/** The key of the match that decides the champion. */
export function finalKey(plan: BracketPlan): string {
  return plan.type === 'double' ? 'GF' : W(plan.rounds, 1)
}

const loserOf = (row: Pick<BracketRow, 'team_a_id' | 'team_b_id' | 'winner_id'>): string | null =>
  !row.winner_id ? null : row.winner_id === row.team_a_id ? row.team_b_id : row.team_a_id

const isDone = (row: Pick<BracketRow, 'status' | 'winner_id'> | undefined): row is BracketRow =>
  !!row && !!row.winner_id && (row.status === 'completed' || row.status === 'forfeit')

/** True once every match that decides a podium place is recorded. */
export function bracketComplete(plan: BracketPlan, byKey: ReadonlyMap<string, BracketRow>): boolean {
  if (!isDone(byKey.get(finalKey(plan)))) return false
  const tp = byKey.get('TP')
  return !tp || isDone(tp)
}

/**
 * 1st / 2nd / 3rd from a finished bracket. Third place: the third-place match
 * winner; otherwise (single elimination) both semifinal losers share it; in
 * double elimination, the losers-final loser.
 */
export function bracketPodium(plan: BracketPlan, byKey: ReadonlyMap<string, BracketRow>): Podium | null {
  const final = byKey.get(finalKey(plan))
  if (!isDone(final) || !bracketComplete(plan, byKey)) return null
  const thirds: string[] = []
  if (plan.type === 'double') {
    const lf = byKey.get(L(2 * (plan.rounds - 1), 1))
    const t = isDone(lf) ? loserOf(lf) : null
    if (t) thirds.push(t)
  } else if (isDone(byKey.get('TP'))) {
    thirds.push((byKey.get('TP') as BracketRow).winner_id as string)
  } else if (plan.rounds >= 2) {
    for (const m of [1, 2]) {
      const semi = byKey.get(W(plan.rounds - 1, m))
      const t = isDone(semi) ? loserOf(semi) : null
      if (t) thirds.push(t)
    }
  }
  return { first: final.winner_id, second: loserOf(final), thirds }
}

/** Slot a team occupies in a row, for advancement writes. */
export function slotColumn(slot: BracketSlot): 'team_a_id' | 'team_b_id' {
  return slot === 'a' ? 'team_a_id' : 'team_b_id'
}
