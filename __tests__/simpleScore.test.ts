import { addPoint, newSimpleMatch, parseSimpleMatch, replaySimple, setTarget, setWinner, SIMPLE_FORMATS, undoPoint } from '../lib/simpleScore'
import type { SimpleMatch, TeamSide } from '../types/scoresheet'

const fmt = (key: string) => SIMPLE_FORMATS.find(f => f.key === key)!.format
const start = (key = 'bo3', firstServe: TeamSide = 'A') => newSimpleMatch({ names: { A: 'Sharks', B: ' ' }, format: fmt(key), firstServe, now: 0 })
const play = (m: SimpleMatch, seq: string) => [...seq].reduce((x, c) => addPoint(x, c as TeamSide, 1), m)
const times = (t: TeamSide, n: number) => t.repeat(n)

describe('simple score', () => {
  it('names empty teams and keeps the format', () => {
    const m = start()
    expect(m.names).toEqual({ A: 'Sharks', B: 'Team B' })
    expect(replaySimple(m)).toMatchObject({ sets: [{ A: 0, B: 0, target: 25, winner: null }], serving: 'A', over: false })
  })

  it('needs two ahead past the target, and stops at a cap', () => {
    expect(setWinner(25, 24, 25, null)).toBeNull()
    expect(setWinner(26, 24, 25, null)).toBe('A')
    expect(setWinner(27, 26, 25, 27)).toBe('A')
    expect(setWinner(15, 13, 15, null)).toBe('A')
  })

  it('plays the deciding set of a best-of to 15', () => {
    expect(setTarget(fmt('bo3'), 2)).toBe(15)
    expect(setTarget(fmt('bo5'), 3)).toBe(25)
    expect(setTarget(fmt('bo5'), 4)).toBe(15)
    expect(setTarget(fmt('one21'), 0)).toBe(21)
  })

  it('the rally winner serves; each new set the other team serves first', () => {
    let m = play(start('bo3', 'A'), 'B')
    expect(replaySimple(m).serving).toBe('B')
    m = play(start('bo3', 'A'), times('A', 25))
    const s = replaySimple(m)
    expect(s.sets[0]).toMatchObject({ A: 25, B: 0, winner: 'A' })
    expect(s.setJustEnded).toBe(true)
    expect(s.current).toBe(1)
    expect(s.serving).toBe('B')
    expect(replaySimple(play(m, 'A')).setJustEnded).toBe(false)
  })

  it('ends the match at two sets and ignores further points', () => {
    let m = play(start('bo3'), times('A', 25) + times('B', 25) + times('A', 15))
    const s = replaySimple(m)
    expect(s).toMatchObject({ over: true, winner: 'A', setsWon: { A: 2, B: 1 } })
    expect(s.sets.map(x => [x.A, x.B])).toEqual([[25, 0], [0, 25], [15, 0]])
    expect(addPoint(m, 'B', 2)).toBe(m)
    m = undoPoint(m, 3)
    expect(replaySimple(m)).toMatchObject({ over: false, setsWon: { A: 1, B: 1 } })
    expect(replaySimple(m).sets[2]).toMatchObject({ A: 14, B: 0, target: 15 })
  })

  it('undo steps back across a set end', () => {
    const m = undoPoint(play(start('bo3'), times('A', 25)), 2)
    const s = replaySimple(m)
    expect(s.sets).toHaveLength(1)
    expect(s.sets[0]).toMatchObject({ A: 24, winner: null })
    expect(undoPoint(start(), 1).rallies).toEqual([])
  })

  it('reads back only a valid saved match', () => {
    const m = play(start(), 'AB')
    expect(parseSimpleMatch(JSON.stringify(m))).toEqual(m)
    expect(parseSimpleMatch('nope')).toBeNull()
    expect(parseSimpleMatch(JSON.stringify({ ...m, rallies: ['C'] }))).toBeNull()
    expect(parseSimpleMatch(null)).toBeNull()
  })
})

describe('−1', () => {
  const { minusPoint, newSimpleMatch, replaySimple } = require('../lib/simpleScore')
  const fmt = { sets: 3, target: 25, cap: null }
  const base = (rallies: ('A' | 'B')[]) => ({ ...newSimpleMatch({ names: { A: 'A', B: 'B' }, format: fmt, firstServe: 'A', now: 0 }), rallies })

  test("takes away the team's latest point in this set", () => {
    const m = minusPoint(base(['A', 'B', 'A', 'B']), 'A', 1)
    expect(m.rallies).toEqual(['A', 'B', 'B'])
    expect(replaySimple(m).sets[0]).toMatchObject({ A: 1, B: 2 })
  })

  test('never reaches into a set once the next one has points', () => {
    const set1 = Array.from({ length: 25 }, () => 'A' as const)
    const m = base([...set1, 'B'])
    expect(minusPoint(m, 'A', 1)).toBe(m)
    expect(minusPoint(m, 'B', 1).rallies).toEqual(set1)
  })

  test('right after a set ends, −1 reopens it (a wrong 25th point is fixable)', () => {
    const set1 = Array.from({ length: 25 }, () => 'A' as const)
    const m = minusPoint(base(set1), 'A', 1)
    const s = replaySimple(m)
    expect(s.sets).toHaveLength(1)
    expect(s.sets[0]).toMatchObject({ A: 24, B: 0, winner: null })
  })

  test('after the match ends, −1 reopens the last set', () => {
    const won = Array.from({ length: 25 }, () => 'A' as const)
    const m = base([...won, ...won])
    expect(replaySimple(m).over).toBe(true)
    const back = replaySimple(minusPoint(m, 'A', 1))
    expect(back.over).toBe(false)
    expect(back.sets[1]).toMatchObject({ A: 24 })
  })
})
