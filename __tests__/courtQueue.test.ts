import {
  moveInQueue, parseQueueState, setCourtCount, placeOf, recordResult, reorderQueue, ruleColumns, ruleFromColumns, startQueue,
  syncTeams, tally, undoLast, usableCourts, winnerComesOff, COURT_QUEUE_UNDO_DEPTH,
} from '../utils/courtQueue'
import type { CourtQueueRule } from '../types'

/** #333: open-play rotation. Teams are event team numbers (1 Purple, 2 Red, 3 Green, 4 Orange…). */
const STAY3: CourtQueueRule = { kind: 'stay', stayMax: 3 }
const ALWAYS: CourtQueueRule = { kind: 'stay', stayMax: null }
const BOTH_OFF: CourtQueueRule = { kind: 'both_off' }

describe('startQueue', () => {
  it('fills courts in order and lines up the rest', () => {
    const s = startQueue([4, 2, 1, 3], 1)
    expect(s.courts).toEqual([[1, 2]])
    expect(s.queue).toEqual([3, 4])
  })

  it('uses only as many courts as there are pairs of teams', () => {
    expect(startQueue([1, 2, 3], 2).courts).toEqual([[1, 2]])
    expect(startQueue([1, 2, 3, 4, 5], 2).courts).toEqual([[1, 2], [3, 4]])
    expect(usableCourts(12, 9)).toBe(4)
  })

  it('needs two teams', () => {
    expect(() => startQueue([1], 1)).toThrow()
  })
})

describe('winners stay', () => {
  it('the loser goes to the back and the next team comes on, winner keeps its side', () => {
    const s = recordResult(startQueue([1, 2, 3, 4], 1), STAY3, 0, 2)
    expect(s.courts).toEqual([[3, 2]])
    expect(s.queue).toEqual([4, 1])
    expect(s.streaks).toEqual({ 2: 1 })
  })

  it('at the limit both come off, winner ahead of the loser', () => {
    let s = startQueue([1, 2, 3, 4], 1)
    s = recordResult(s, STAY3, 0, 1) // 1 beats 2 → [1,3], q [4,2]
    s = recordResult(s, STAY3, 0, 1) // 1 beats 3 → [1,4], q [2,3]
    s = recordResult(s, STAY3, 0, 1) // third win: both off → q [2,3,1,4] → [2,3]
    expect(s.courts).toEqual([[2, 3]])
    expect(s.queue).toEqual([1, 4])
    expect(s.streaks).toEqual({})
  })

  it('"always" never takes the winner off', () => {
    let s = startQueue([1, 2, 3], 1)
    for (let i = 0; i < 8; i++) s = recordResult(s, ALWAYS, 0, 1)
    expect(s.courts[0]).toContain(1)
    expect(s.streaks[1]).toBe(8)
  })

  it('winnerComesOff follows the rule', () => {
    expect(winnerComesOff(STAY3, 2)).toBe(false)
    expect(winnerComesOff(STAY3, 3)).toBe(true)
    expect(winnerComesOff(ALWAYS, 50)).toBe(false)
    expect(winnerComesOff(BOTH_OFF, 1)).toBe(true)
  })
})

describe('both off', () => {
  it('both teams go to the back every game; the longest waiting go on', () => {
    const s = recordResult(startQueue([1, 2, 3, 4, 5], 1), BOTH_OFF, 0, 2)
    expect(s.courts).toEqual([[3, 4]])
    expect(s.queue).toEqual([5, 2, 1])
  })

  it('with two teams on one court they simply play again', () => {
    const s = recordResult(startQueue([1, 2], 1), BOTH_OFF, 0, 1)
    expect(s.courts).toEqual([[1, 2]])
    expect(s.queue).toEqual([])
  })
})

describe('two courts', () => {
  it('each court draws from the one line', () => {
    let s = startQueue([1, 2, 3, 4, 5, 6], 2)
    s = recordResult(s, STAY3, 1, 4) // court 2: 4 beats 3 → [5,4], q [6,3]
    expect(s.courts).toEqual([[1, 2], [5, 4]])
    s = recordResult(s, STAY3, 0, 1) // court 1: 1 beats 2 → [1,6], q [3,2]
    expect(s.courts).toEqual([[1, 6], [5, 4]])
    expect(s.queue).toEqual([3, 2])
  })

  it('refuses a winner who is not on that court', () => {
    expect(() => recordResult(startQueue([1, 2, 3, 4], 2), STAY3, 0, 3)).toThrow()
  })
})

describe('undo, reorder', () => {
  it('Undo restores exactly the state before, games included', () => {
    const a = startQueue([1, 2, 3, 4], 1)
    const b = recordResult(a, STAY3, 0, 2)
    const c = recordResult(b, STAY3, 0, 3)
    expect(undoLast(c)).toEqual(b)
    expect(undoLast(undoLast(c))).toEqual(a)
    expect(undoLast(a)).toBe(a)
  })

  it('keeps a bounded undo history', () => {
    let s = startQueue([1, 2, 3], 1)
    for (let i = 0; i < 30; i++) s = recordResult(s, ALWAYS, 0, 1)
    expect(s.undo).toHaveLength(COURT_QUEUE_UNDO_DEPTH)
  })

  it('the host reorders the line, and the move can be undone', () => {
    const s = startQueue([1, 2, 3, 4, 5], 1)
    const moved = moveInQueue(s, 5, -1)
    expect(moved.queue).toEqual([3, 5, 4])
    expect(undoLast(moved).queue).toEqual([3, 4, 5])
    expect(moveInQueue(s, 3, -1)).toBe(s)
    expect(() => reorderQueue(s, [3, 4])).toThrow()
  })
})

describe('syncTeams', () => {
  it('drops a team that is gone and fills its spot from the line', () => {
    const s = syncTeams(startQueue([1, 2, 3, 4], 1), [1, 3, 4])
    expect(s.courts).toEqual([[1, 3]])
    expect(s.queue).toEqual([4])
  })

  it('adds a new team to the back', () => {
    const s = syncTeams(startQueue([1, 2, 3], 1), [1, 2, 3, 4])
    expect(s.queue).toEqual([3, 4])
  })

  it('a court that can no longer be filled gives its team back to the line', () => {
    const s = syncTeams(startQueue([1, 2, 3, 4], 2), [1, 2, 3])
    expect(s.courts).toEqual([[1, 2], null])
    expect(s.queue).toEqual([3])
  })

  it('no change, same state', () => {
    const s = startQueue([1, 2, 3], 1)
    expect(syncTeams(s, [3, 2, 1])).toBe(s)
  })
})

describe('placeOf and tally', () => {
  it('says where a team is', () => {
    const s = startQueue([1, 2, 3, 4], 1)
    expect(placeOf(s, 2)).toEqual({ kind: 'court', court: 0 })
    expect(placeOf(s, 3)).toEqual({ kind: 'queue', ahead: 0 })
    expect(placeOf(s, 4)).toEqual({ kind: 'queue', ahead: 1 })
    expect(placeOf(s, 6)).toBeNull()
    expect(placeOf(s, null)).toBeNull()
  })

  it('counts wins and losses, best record first', () => {
    let s = startQueue([1, 2, 3], 1)
    s = recordResult(s, STAY3, 0, 1) // 1 beats 2
    s = recordResult(s, STAY3, 0, 3) // 3 beats 1
    expect(tally(s)).toEqual([
      { team: 1, wins: 1, losses: 1 },
      { team: 3, wins: 1, losses: 0 },
      { team: 2, wins: 0, losses: 1 },
    ].sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.team - b.team))
  })
})

describe('storage', () => {
  it('rules round-trip through their columns', () => {
    for (const r of [STAY3, ALWAYS, BOTH_OFF]) {
      const c = ruleColumns(r)
      expect(ruleFromColumns(c.rule, c.stay_max)).toEqual(r)
    }
  })

  it('reads a saved state, and refuses a broken one', () => {
    const s = recordResult(startQueue([1, 2, 3], 1), STAY3, 0, 1)
    expect(parseQueueState(JSON.parse(JSON.stringify(s)))).toEqual(s)
    expect(parseQueueState(null)).toBeNull()
    expect(parseQueueState({ courts: [[1, 9]], queue: [] })).toBeNull()
    expect(parseQueueState({ courts: [[1, 2]], queue: ['3'] })).toBeNull()
  })
})

describe('setCourtCount', () => {
  it('a new court takes the next two in line', () => {
    const s = setCourtCount(startQueue([1, 2, 3, 4, 5], 1), 2)
    expect(s.courts).toEqual([[1, 2], [3, 4]])
    expect(s.queue).toEqual([5])
  })

  it('a closing court sends its teams to the front of the line', () => {
    const s = setCourtCount(startQueue([1, 2, 3, 4, 5], 2), 1)
    expect(s.courts).toEqual([[1, 2]])
    expect(s.queue).toEqual([3, 4, 5])
  })

  it('never more courts than pairs of teams', () => {
    const s = startQueue([1, 2, 3], 1)
    expect(setCourtCount(s, 3)).toBe(s)
  })
})
