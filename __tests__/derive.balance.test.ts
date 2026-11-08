import { balanceAssignments, levelForPoints, randomizeAssignments, rosterHasLevels, SKILL_POINTS, teamSummary } from '../hooks/event/derive'
import type { BalancePlayer, TeamAssignment, VolleyballSkillLevel } from '../types'

/** Deterministic PRNG (mulberry32) so a failing seed can be replayed. */
function seeded(seed: number) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const p = (id: string, skillLevel: VolleyballSkillLevel | null, isSetter = false): BalancePlayer => ({ id, skillLevel, isSetter })

// The roster from the issue: one random draw split it 28 vs 20 with both setters on one team.
const ROSTER: BalancePlayer[] = [
  p('maya', 'aa_plus'), p('priya', 'a', true), p('aisha', 'a'), p('sofia', 'bb'), p('emma', 'bb'), p('zoe', 'bb', true),
  p('jordan', 'a'), p('marco', 'b'), p('liam', 'b'), p('dani', 'b'), p('noah', 'c'), p('guest-1', null),
]
const none = (players: BalancePlayer[]) => Object.fromEntries(players.map(x => [x.id, { team: null, pinned: false }])) as Record<string, TeamAssignment>

function totals(players: BalancePlayer[], asg: Record<string, TeamAssignment>, numTeams: number) {
  const known = players.filter(x => x.skillLevel).map(x => SKILL_POINTS[x.skillLevel!])
  const mean = known.reduce((a, b) => a + b, 0) / known.length
  const out = Array.from({ length: numTeams }, () => ({ total: 0, setters: 0, size: 0 }))
  for (const x of players) {
    const t = asg[x.id].team!
    out[t - 1].total += x.skillLevel ? SKILL_POINTS[x.skillLevel] : mean
    out[t - 1].setters += x.isSetter ? 1 : 0
    out[t - 1].size += 1
  }
  return out
}

describe('balanceAssignments', () => {
  it.each([1, 2, 3, 42, 99])('splits the roster within 1 tier point with a setter each (seed %i)', seed => {
    const r = balanceAssignments(ROSTER, none(ROSTER), 2, seeded(seed))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const [a, b] = totals(ROSTER, r.assignments, 2)
    expect(a.size).toBe(6)
    expect(b.size).toBe(6)
    expect(Math.abs(a.total - b.total)).toBeLessThanOrEqual(1)
    expect([a.setters, b.setters]).toEqual([1, 1])
  })

  it('beats random on the same roster', () => {
    let worse = 0
    for (let seed = 1; seed <= 50; seed++) {
      const rnd = randomizeAssignments(ROSTER.map(x => x.id), none(ROSTER), 2, seeded(seed))
      const bal = balanceAssignments(ROSTER, none(ROSTER), 2, seeded(seed))
      if (!rnd.ok || !bal.ok) throw new Error('split failed')
      const [ra, rb] = totals(ROSTER, rnd.assignments, 2)
      const [ba, bb] = totals(ROSTER, bal.assignments, 2)
      if (Math.abs(ba.total - bb.total) > Math.abs(ra.total - rb.total)) worse++
    }
    expect(worse).toBe(0)
  })

  it('never moves pinned players', () => {
    const asg = none(ROSTER)
    asg.maya = { team: 1, pinned: true }
    asg.jordan = { team: 1, pinned: true }
    const r = balanceAssignments(ROSTER, asg, 2, seeded(7))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.assignments.maya).toEqual({ team: 1, pinned: true })
    expect(r.assignments.jordan).toEqual({ team: 1, pinned: true })
    const [a, b] = totals(ROSTER, r.assignments, 2)
    expect(Math.abs(a.total - b.total)).toBeLessThanOrEqual(1.5)
  })

  it('returns the same errors as Randomize', () => {
    const odd = ROSTER.slice(0, 11)
    expect(balanceAssignments(odd, none(odd), 2)).toEqual(randomizeAssignments(odd.map(x => x.id), none(odd), 2))
    const asg = none(ROSTER)
    ROSTER.slice(0, 7).forEach(x => { asg[x.id] = { team: 1, pinned: true } })
    const r = balanceAssignments(ROSTER, asg, 2)
    expect(r).toMatchObject({ ok: false, title: 'Too many pinned' })
  })

  it('with no levels at all, is an even random split', () => {
    const blank = ROSTER.map(x => ({ ...x, skillLevel: null }))
    const r = balanceAssignments(blank, none(blank), 3, seeded(5))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const sizes = [1, 2, 3].map(t => blank.filter(x => r.assignments[x.id].team === t).length)
    expect(sizes).toEqual([4, 4, 4])
  })

  it('is deterministic for a given random source', () => {
    expect(balanceAssignments(ROSTER, none(ROSTER), 3, seeded(11))).toEqual(balanceAssignments(ROSTER, none(ROSTER), 3, seeded(11)))
  })

  it('spreads setters across three teams when there are enough', () => {
    const roster = [...ROSTER.slice(0, 11), p('setter-3', 'b', true)]
    const r = balanceAssignments(roster, none(roster), 3, seeded(3))
    if (!r.ok) throw new Error(r.message)
    expect(totals(roster, r.assignments, 3).map(t => t.setters)).toEqual([1, 1, 1])
  })
})

describe('team summary chips', () => {
  it('averages the tier and counts setters', () => {
    expect(teamSummary([p('a', 'a'), p('b', 'bb', true), p('c', 'b')], true)).toEqual({ avgLevel: 'bb', setters: 1 })
  })

  it('hides the average when fewer than half the roster have a level', () => {
    const roster = [p('a', 'a'), p('b', null), p('c', null)]
    expect(rosterHasLevels(roster)).toBe(false)
    expect(teamSummary(roster, rosterHasLevels(roster)).avgLevel).toBeNull()
  })

  it('rounds points to a tier', () => {
    expect(levelForPoints(4.4)).toBe('bb')
    expect(levelForPoints(5.6)).toBe('aa_plus')
    expect(levelForPoints(0.2)).toBe('d')
  })
})
