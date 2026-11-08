import { replay } from '../lib/scoresheet/engine'
import { EXAMPLE_MATCH_ID, exampleMatch } from '../lib/scoresheet/exampleMatch'

describe('example match', () => {
  const NOW = new Date(2026, 10, 7, 19, 0).getTime()
  const doc = exampleMatch(NOW)
  const state = replay(doc.setup, doc.log)

  it('is a finished best-of-3 won 2–0 by the Aces', () => {
    expect(doc.id).toBe(EXAMPLE_MATCH_ID)
    expect(doc.example).toBe(true)
    expect(state.over).toBe(true)
    expect(state.winner).toBe('A')
    expect(state.sets).toHaveLength(2)
    for (const set of state.sets) expect(set.teams.A.score).toBe(25)
  })

  it('shows the things a real match has: time-outs, subs, a libero and a sanction', () => {
    const count = (type: string) => doc.log.filter(e => e.type === type).length
    expect(count('timeout')).toBe(3)
    expect(count('sub')).toBe(3)
    expect(count('libero_in')).toBe(1)
    expect(count('sanction')).toBe(1)
    console.log(state.sets.map(s => `${s.teams.A.score}-${s.teams.B.score}`))
  })

  it('records no rule-break warnings', () => {
    expect(JSON.stringify(state.warnings ?? [])).toBe('[]')
  })

  it('is the same every time', () => {
    expect(exampleMatch(NOW).log.map(e => e.type)).toEqual(doc.log.map(e => e.type))
  })
})
