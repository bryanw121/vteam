import {
  advanceFrom, bracketComplete, bracketPodium, finalKey, generateBracket, keyedRows, nextPow2, nodeStates,
  planBracket, planFromRows, rowKey, seedOrder, type BracketRow,
} from '../lib/tournamentBracket'
import type { BracketMatchInsert, TournamentBracketType } from '../types'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`)

/**
 * Play a whole bracket in memory: insert the generated rows, then repeatedly
 * record the first playable match (lower seed number wins unless `upset` says
 * otherwise) and apply `advanceFrom`, like the app does.
 */
function simulate(n: number, type: TournamentBracketType, thirdPlace = false, upset: (a: string, b: string) => boolean = () => false) {
  const generated = generateBracket(ids(n), type, thirdPlace)
  const rows: (BracketRow & { key: string })[] = generated.map((g, i) => ({
    id: `m${i}`, key: g.key, round: g.round, match_number: g.match_number, is_losers_bracket: g.is_losers_bracket,
    team_a_id: g.team_a_id, team_b_id: g.team_b_id, winner_id: null, status: 'scheduled',
  }))
  const plan = planFromRows(rows, type)
  if (!plan) throw new Error('no plan')
  const stored = new Set(rows.map(r => rowKey(r, plan)))
  const played: string[] = []
  for (let guard = 0; guard < 500; guard++) {
    const next = rows.find(r => r.status === 'scheduled' && r.team_a_id && r.team_b_id)
    if (!next) break
    const a = next.team_a_id as string
    const b = next.team_b_id as string
    const seedNum = (t: string) => Number(t.slice(1))
    let winner = seedNum(a) < seedNum(b) ? a : b
    if (upset(a, b)) winner = winner === a ? b : a
    const loser = winner === a ? b : a
    next.winner_id = winner
    next.status = 'completed'
    played.push(rowKey(next, plan))
    for (const adv of advanceFrom(plan, stored, rowKey(next, plan), winner, loser)) {
      const target = rows.find(r => rowKey(r, plan) === adv.key)
      if (!target) throw new Error(`missing ${adv.key}`)
      if (adv.slot === 'a') target.team_a_id = adv.teamId
      else target.team_b_id = adv.teamId
    }
  }
  return { rows, plan, played, byKey: keyedRows(rows, plan) }
}

describe('seed order', () => {
  it('nextPow2', () => {
    expect([1, 2, 3, 4, 5, 8, 9, 16, 17].map(nextPow2)).toEqual([1, 2, 4, 4, 8, 8, 16, 16, 32])
  })

  it('standard order: top seeds meet as late as possible', () => {
    expect(seedOrder(2)).toEqual([1, 2])
    expect(seedOrder(4)).toEqual([1, 4, 2, 3])
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
    const o16 = seedOrder(16)
    for (let i = 0; i < 16; i += 2) expect(o16[i] + o16[i + 1]).toBe(17)
    // Seeds 1 and 2 are in different halves.
    expect(o16.indexOf(1) < 8).not.toBe(o16.indexOf(2) < 8)
  })
})

describe('single elimination', () => {
  it.each([2, 3, 4, 5, 6, 7, 8, 9, 12, 16, 17])('%i teams: n-1 matches, one champion', n => {
    const rows = generateBracket(ids(n))
    expect(rows).toHaveLength(n - 1)
    const sim = simulate(n, 'single')
    expect(sim.rows.every(r => r.status === 'completed')).toBe(true)
    expect(bracketPodium(sim.plan, sim.byKey)?.first).toBe('s1')
  })

  it('byes go to the top seeds, who start in round two', () => {
    const rows = generateBracket(ids(6))
    const r1 = rows.filter(r => r.round === 1)
    expect(r1.map(r => [r.team_a_id, r.team_b_id])).toEqual([['s4', 's5'], ['s3', 's6']])
    const r2 = rows.filter(r => r.round === 2)
    expect(r2.map(r => r.bracket_round_name)).toEqual(['Semifinal', 'Semifinal'])
    expect(r2.map(r => r.team_a_id)).toEqual(['s1', 's2'])
    expect(r2.map(r => r.team_b_id)).toEqual([null, null])
  })

  it('round names', () => {
    const names = new Set(generateBracket(ids(16)).map(r => `${r.round}:${r.bracket_round_name}`))
    expect(names).toEqual(new Set(['1:Round of 16', '2:Quarterfinal', '3:Semifinal', '4:Final']))
  })

  it('every non-final match feeds exactly one later match; waves respect the feeds', () => {
    const rows = generateBracket(ids(11))
    const plan = planBracket(11)
    const wave = new Map(rows.map(r => [r.key, r.wave]))
    for (const r of rows) {
      const to = plan.nodes[r.key].winnerTo
      if (r.key === finalKey(plan)) expect(to).toBeNull()
      // The landing match (skipping byes) is played in a later wave.
      let at = to
      while (at && !wave.has(at.node)) at = plan.nodes[at.node].winnerTo
      if (at) expect(wave.get(at.node)).toBeGreaterThan(r.wave)
    }
  })

  it('semifinal losers share third place without a third-place match', () => {
    const sim = simulate(8, 'single')
    expect(bracketPodium(sim.plan, sim.byKey)).toEqual({ first: 's1', second: 's2', thirds: ['s4', 's3'] })
  })

  it('a third-place match decides a single third', () => {
    const sim = simulate(8, 'single', true)
    expect(sim.rows).toHaveLength(8)
    expect(sim.byKey.has('TP')).toBe(true)
    expect(bracketPodium(sim.plan, sim.byKey)).toEqual({ first: 's1', second: 's2', thirds: ['s3'] })
  })

  it('three teams with a third-place match: no such match (one semifinal), its loser is third', () => {
    const rows = generateBracket(ids(3), 'single', true)
    expect(rows.map(r => r.key)).toEqual(['W1-2', 'W2-1'])
    const sim = simulate(3, 'single', true)
    expect(bracketPodium(sim.plan, sim.byKey)).toEqual({ first: 's1', second: 's2', thirds: ['s3'] })
  })

  it('two teams: just a final, no third place', () => {
    const sim = simulate(2, 'single', true)
    expect(sim.rows).toHaveLength(1)
    expect(bracketPodium(sim.plan, sim.byKey)).toEqual({ first: 's1', second: 's2', thirds: [] })
  })

  it('upsets move the right team on', () => {
    const sim = simulate(4, 'single', false, (a, b) => [a, b].includes('s4') && [a, b].includes('s1'))
    expect(bracketPodium(sim.plan, sim.byKey)?.first).toBe('s2')
    expect(sim.byKey.get('W2-1')?.team_a_id).toBe('s4')
  })

  it('no podium until the final (and third-place match) are recorded', () => {
    const sim = simulate(8, 'single', true)
    const tp = sim.byKey.get('TP') as BracketRow
    tp.status = 'scheduled'
    tp.winner_id = null
    expect(bracketComplete(sim.plan, sim.byKey)).toBe(false)
    expect(bracketPodium(sim.plan, sim.byKey)).toBeNull()
  })
})

describe('double elimination', () => {
  it.each([2, 3, 4, 5, 6, 7, 8, 11, 16])('%i teams: 2n-2 matches, champion and podium', n => {
    const rows = generateBracket(ids(n), 'double')
    expect(rows).toHaveLength(2 * n - 2)
    const sim = simulate(n, 'double')
    expect(sim.rows.every(r => r.status === 'completed')).toBe(true)
    const podium = bracketPodium(sim.plan, sim.byKey)
    expect(podium?.first).toBe('s1')
    expect(podium?.second).toBe('s2')
    if (n >= 3) expect(podium?.thirds).toEqual(['s3'])
  })

  it('every team except the champion loses exactly twice, except the runner-up (no reset match)', () => {
    const sim = simulate(8, 'double', false, (a, b) => (a === 's5' || b === 's5'))
    const losses = new Map<string, number>()
    for (const r of sim.rows) {
      const loser = r.winner_id === r.team_a_id ? r.team_b_id : r.team_a_id
      if (loser) losses.set(loser, (losses.get(loser) ?? 0) + 1)
    }
    const champion = bracketPodium(sim.plan, sim.byKey)?.first as string
    expect(losses.get(champion) ?? 0).toBeLessThanOrEqual(1)
    const twice = ids(8).filter(t => (losses.get(t) ?? 0) === 2)
    expect(twice.length).toBeGreaterThanOrEqual(6)
    ids(8).forEach(t => expect(losses.get(t) ?? 0).toBeLessThanOrEqual(2))
  })

  it('names the losers bracket and grand final', () => {
    const rows = generateBracket(ids(8), 'double')
    const names = new Set(rows.map(r => r.bracket_round_name))
    expect(names).toEqual(new Set([
      'Quarterfinal', 'Semifinal', 'Winners final', 'Losers round 1', 'Losers round 2', 'Losers round 3', 'Losers final', 'Grand final',
    ]))
    expect(rows.filter(r => r.is_losers_bracket)).toHaveLength(6)
  })

  it('two teams: final, then a rematch grand final', () => {
    const rows = generateBracket(ids(2), 'double')
    expect(rows.map(r => r.key)).toEqual(['W1-1', 'GF'])
  })
})

describe('plan from stored rows', () => {
  const asRow = (g: BracketMatchInsert, i: number): BracketRow => ({
    id: String(i), round: g.round, match_number: g.match_number, is_losers_bracket: g.is_losers_bracket,
    team_a_id: g.team_a_id, team_b_id: g.team_b_id, winner_id: null, status: 'scheduled',
  })

  it.each([
    [5, 'single', false], [8, 'single', true], [6, 'double', false], [2, 'double', false],
  ] as const)('%i teams %s: rebuilt plan maps every row back to its key', (n, type, tp) => {
    const generated = generateBracket(ids(n), type, tp)
    const rows = generated.map(asRow)
    const plan = planFromRows(rows, type)
    expect(plan).not.toBeNull()
    expect(rows.map(r => rowKey(r, plan!))).toEqual(generated.map(g => g.key))
    expect(plan!.thirdPlace).toBe(tp && n >= 4)
  })

  it('no rows -> no plan', () => {
    expect(planFromRows([], 'single')).toBeNull()
  })

  it('node states: pass nodes are byes, dead nodes are never reached', () => {
    // 5 teams in an 8-bracket: 1 v 8, 4 v 5, 2 v 7, 3 v 6 -> only 4 v 5 is played.
    const states = nodeStates(planBracket(5, 'double'), 5)
    expect([states['W1-1'], states['W1-2'], states['W1-3'], states['W1-4']]).toEqual(['pass', 'live', 'pass', 'pass'])
    expect(states['L1-1']).toBe('pass')     // only the 4 v 5 loser arrives
    expect(states['L1-2']).toBe('dead')     // losers of two byes: nobody
    expect(states.GF).toBe('live')
  })
})
