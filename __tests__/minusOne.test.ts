import { lastPointEventId } from '../lib/scoresheet/minusOne'
import type { ScoreEvent } from '../types'

const start = { id: 's', at: 0, type: 'set_start', lineups: { A: [1, 2, 3, 4, 5, 6], B: [7, 8, 9, 10, 11, 12] }, firstServe: 'A', liberos: { A: [], B: [] } } as unknown as ScoreEvent
const rally = (id: string, winner: 'A' | 'B') => ({ id, at: 0, type: 'rally', winner }) as ScoreEvent

describe('−1', () => {
  test("takes the team's latest point, even with the other team's points after it", () => {
    const log = [start, rally('r1', 'A'), rally('r2', 'B'), rally('r3', 'A'), rally('r4', 'B')]
    expect(lastPointEventId(log, 'A')).toBe('r3')
    expect(lastPointEventId(log, 'B')).toBe('r4')
  })

  test('counts points from the other team’s faults', () => {
    const log = [start, rally('r1', 'A'), { id: 'f', at: 0, type: 'rotation_fault', team: 'A' } as ScoreEvent]
    expect(lastPointEventId(log, 'B')).toBe('f')
    const ws = [start, { id: 'w', at: 0, type: 'wrong_server', team: 'B', when: 'after-serve' } as ScoreEvent]
    expect(lastPointEventId(ws, 'A')).toBe('w')
  })

  test('never reaches into an earlier set or past a hand-set score', () => {
    expect(lastPointEventId([start, rally('r1', 'A'), start, rally('r2', 'B')], 'A')).toBeNull()
    const override = { id: 'o', at: 0, type: 'override', reason: 'x', score: { A: 3, B: 2 } } as ScoreEvent
    expect(lastPointEventId([start, rally('r1', 'A'), override], 'A')).toBeNull()
  })
})
