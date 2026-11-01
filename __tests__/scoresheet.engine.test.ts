import { courtOf, nextSetDefaults, replay, serverOf, servingRalliesInCurrentSet } from '../lib/scoresheet/engine'
import { canRedo, canUndo, deleteEvent, editEvent, insertBefore, record, redo, undo } from '../lib/scoresheet/history'
import { MATCH_FORMATS, makeRules } from '../lib/scoresheet/rules'
import { pickNewest } from '../lib/scoresheet/storageCore'
import type { Lineup, MatchDoc, MatchFormat, MatchSetup, RulesPreset, ScoreEventInput, TeamSide } from '../types/scoresheet'

const LINEUP_A: Lineup = [1, 2, 3, 4, 5, 6]
const LINEUP_B: Lineup = [11, 12, 13, 14, 15, 16]

function setupOf(preset: RulesPreset = 'usav', format: MatchFormat = MATCH_FORMATS.bestOf3): MatchSetup {
  const players = (nums: number[], libero: number) => [...nums, 7, 8, 9, 10, libero].map(n => ({ number: n, libero: n === libero }))
  return {
    info: {},
    teams: {
      A: { name: 'Aces', players: players([...LINEUP_A], 20) },
      B: { name: 'Blockers', players: players([...LINEUP_B], 30) },
    },
    rules: makeRules(preset, format),
  }
}

function docOf(setup = setupOf()): MatchDoc {
  return { id: 'm1', createdAt: 0, updatedAt: 0, setup, log: [], undo: [], redo: [] }
}

let clock = 1_000
function play(doc: MatchDoc, ...inputs: ScoreEventInput[]): MatchDoc {
  let d = doc
  for (const input of inputs) d = record(d, input, (clock += 1000)).doc
  return d
}
const start = (firstServe: TeamSide = 'A'): ScoreEventInput => ({
  type: 'set_start',
  lineups: { A: LINEUP_A, B: LINEUP_B },
  firstServe,
  liberos: { A: [20], B: [30] },
})
const rally = (winner: TeamSide): ScoreEventInput => ({ type: 'rally', winner })
const rallies = (winner: TeamSide, n: number) => Array.from({ length: n }, () => rally(winner))
const stateOf = (doc: MatchDoc) => replay(doc.setup, doc.log)

describe('serving and rotation', () => {
  it('scores points for the serving team without rotating', () => {
    const s = stateOf(play(docOf(), start('A'), rally('A'), rally('A')))
    const set = s.sets[0]
    expect(set.teams.A.score).toBe(2)
    expect(set.teams.A.rotation).toBe(0)
    expect(set.teams.A.turns[0]).toEqual([{ endScore: null, points: 2, server: 1 }])
    expect(serverOf(set.teams.A)).toBe(1)
  })

  it('side-out: the receiving team rotates and serves; the server loses the turn at their score', () => {
    const s = stateOf(play(docOf(), start('A'), rally('A'), rally('A'), rally('B')))
    const set = s.sets[0]
    expect(set.serving).toBe('B')
    expect(set.teams.A.turns[0][0]).toEqual({ endScore: 2, points: 2, server: 1 })
    // B never served yet, so winning on receive rotates them: #12 (slot II) serves.
    expect(set.teams.B.rotation).toBe(1)
    expect(serverOf(set.teams.B)).toBe(12)
    expect(set.teams.B.turns[1]).toEqual([{ endScore: null, points: 0, server: 12 }])
    expect(courtOf(set.teams.B).map(c => c.player)).toEqual([12, 13, 14, 15, 16, 11])
  })

  it('wraps the rotation after six side-outs', () => {
    const inputs: ScoreEventInput[] = [start('B')]
    for (let i = 0; i < 6; i++) inputs.push(rally('A'), rally('B'))
    const set = stateOf(play(docOf(), ...inputs)).sets[0]
    expect(set.teams.A.rotation).toBe(0)
    expect(set.teams.B.rotation).toBe(0)
    expect(set.teams.A.turns.map(t => t.length)).toEqual([1, 1, 1, 1, 1, 1])
  })
})

describe('sets and the match', () => {
  it('ends a set at 25 with a two-point lead, and plays on at 24-24', () => {
    let d = play(docOf(), start('A'), ...rallies('A', 24), ...rallies('B', 24))
    expect(stateOf(d).current).toBe(0)
    d = play(d, rally('A'))
    expect(stateOf(d).sets[0].winner).toBeNull()
    d = play(d, rally('A'))
    const s = stateOf(d)
    expect(s.sets[0].winner).toBe('A')
    expect(s.setsWon).toEqual({ A: 1, B: 0 })
    expect(s.current).toBeNull()
    expect(s.sets[0].teams.A.score).toBe(26)
  })

  it('a best-of-3 ends 2-0; nothing scores after', () => {
    const d = play(docOf(), start('A'), ...rallies('A', 25), start('B'), ...rallies('A', 25), rally('B'))
    const s = stateOf(d)
    expect(s.over).toBe(true)
    expect(s.winner).toBe('A')
    expect(s.warnings.at(-1)?.code).toBe('match-over')
  })

  it('pool play plays both sets and can split', () => {
    const d = play(docOf(setupOf('usav', MATCH_FORMATS.twoSets)), start('A'), ...rallies('A', 25), start('B'), ...rallies('B', 25))
    const s = stateOf(d)
    expect(s.over).toBe(true)
    expect(s.winner).toBeNull()
    expect(s.setsWon).toEqual({ A: 1, B: 1 })
  })

  it('the deciding set goes to 15 with a court switch at 8', () => {
    let d = play(docOf(), start('A'), ...rallies('A', 25), start('B'), ...rallies('B', 25))
    expect(nextSetDefaults(d.setup, stateOf(d))).toMatchObject({ index: 2, deciding: true, firstServe: null })
    d = play(d, start('A'), ...rallies('A', 7))
    expect(stateOf(d).sets[2].courtSwitched).toBe(false)
    d = play(d, rally('A'))
    expect(stateOf(d).sets[2]).toMatchObject({ target: 15, courtSwitchAt: 8, courtSwitched: true })
    d = play(d, ...rallies('A', 7))
    expect(stateOf(d).winner).toBe('A')
  })

  it('a cap ends the set without a two-point lead', () => {
    const setup = setupOf('usav', { ...MATCH_FORMATS.bestOf3, cap: 27 })
    const d = play(docOf(setup), start('A'), ...rallies('A', 24), ...rallies('B', 24), rally('A'), rally('B'), rally('A'), rally('B'), rally('A'))
    const set = stateOf(d).sets[0]
    expect(set.teams.A.score).toBe(27)
    expect(set.winner).toBe('A')
  })

  it('suggests the other team serves first next set, with the same lineups', () => {
    const d = play(docOf(), start('A'), ...rallies('A', 25))
    expect(nextSetDefaults(d.setup, stateOf(d))).toMatchObject({ index: 1, firstServe: 'B', lineups: { A: LINEUP_A, B: LINEUP_B } })
  })
})

describe('substitutions', () => {
  it('records the score at the substitution and puts the sub in the slot', () => {
    const d = play(docOf(), start('A'), rally('A'), rally('B'), { type: 'sub', team: 'A', out: 3, in: 7 })
    const t = stateOf(d).sets[0].teams.A
    expect(t.slots).toEqual([1, 2, 7, 4, 5, 6])
    expect(t.subs[0]).toMatchObject({ slot: 2, out: 3, in: 7, score: [1, 1] })
  })

  it('skips a sub for a player who is not on the court', () => {
    const s = stateOf(play(docOf(), start('A'), { type: 'sub', team: 'A', out: 9, in: 7 }))
    expect(s.sets[0].teams.A.subs).toHaveLength(0)
    expect(s.warnings[0].code).toBe('sub-not-on-court')
  })

  it('USAV: warns on the 13th substitution and on a player changing positions, but records both', () => {
    const swaps: ScoreEventInput[] = []
    for (let i = 0; i < 6; i++) swaps.push({ type: 'sub', team: 'A', out: 3, in: 7 }, { type: 'sub', team: 'A', out: 7, in: 3 })
    let d = play(docOf(), start('A'), ...swaps)
    expect(stateOf(d).warnings).toHaveLength(0)
    d = play(d, { type: 'sub', team: 'A', out: 3, in: 7 })
    let s = stateOf(d)
    expect(s.warnings.map(w => w.code)).toEqual(['sub-limit'])
    expect(s.sets[0].teams.A.subs).toHaveLength(13)
    // #3 played position III; bringing them in for #4 (position IV) breaks the serving order.
    d = play(d, { type: 'sub', team: 'A', out: 4, in: 3 })
    s = stateOf(d)
    expect(s.warnings.map(w => w.code)).toContain('sub-reentry')
  })

  it('international: a starter comes back once, only for their substitute', () => {
    const setup = setupOf('international')
    let s = stateOf(play(docOf(setup), start('A'), { type: 'sub', team: 'A', out: 3, in: 7 }, { type: 'sub', team: 'A', out: 7, in: 3 }))
    expect(s.warnings).toHaveLength(0)
    s = stateOf(play(docOf(setup), start('A'), { type: 'sub', team: 'A', out: 3, in: 7 }, { type: 'sub', team: 'A', out: 7, in: 3 }, { type: 'sub', team: 'A', out: 3, in: 7 }))
    expect(s.warnings.map(w => w.code)).toEqual(['sub-reentry'])
  })

  it('exceptional substitutions skip the limits and are noted in remarks', () => {
    const s = stateOf(play(docOf(setupOf('international')), start('A'), { type: 'sub', team: 'A', out: 3, in: 7 }, { type: 'sub', team: 'A', out: 7, in: 8, exceptional: true }))
    expect(s.warnings).toHaveLength(0)
    expect(s.remarks[0]).toMatch(/Exceptional substitution/)
  })
})

describe('time-outs and sanctions', () => {
  it('warns on a third time-out and keeps the score of each', () => {
    const s = stateOf(play(docOf(), start('A'), rally('A'), { type: 'timeout', team: 'B' }, { type: 'timeout', team: 'B' }, { type: 'timeout', team: 'B' }))
    expect(s.sets[0].teams.B.timeouts[0].score).toEqual([0, 1])
    expect(s.warnings.map(w => w.code)).toEqual(['timeout-limit'])
  })

  it('a penalty gives the opponent a point and the serve', () => {
    const s = stateOf(play(docOf(), start('A'), { type: 'sanction', team: 'A', kind: 'penalty', who: 4 }))
    const set = s.sets[0]
    expect(set.teams.B.score).toBe(1)
    expect(set.teams.B.marks).toEqual(['penalty'])
    expect(set.serving).toBe('B')
    expect(s.sanctions[0]).toMatchObject({ team: 'A', kind: 'penalty', who: 4, set: 0, score: [0, 0] })
  })

  it('a warning gives no point', () => {
    const s = stateOf(play(docOf(), start('A'), { type: 'sanction', team: 'B', kind: 'delay-warning' }))
    expect(s.sets[0].teams.A.score).toBe(0)
    expect(s.sanctions).toHaveLength(1)
  })
})

describe('wrong server', () => {
  it('caught after the serve: the rally goes to the opponent', () => {
    const s = stateOf(play(docOf(), start('A'), rally('A'), { type: 'wrong_server', team: 'A', when: 'after-serve' }))
    expect(s.sets[0].teams.B.score).toBe(1)
    expect(s.sets[0].serving).toBe('B')
    expect(s.remarks[0]).toMatch(/out of rotation/)
  })

  it('discovered later: points scored since the wrong server started are cancelled', () => {
    let d = play(docOf(), start('A'), rally('B'), rally('A'))
    // A regained serve at 1-1; the wrong player served and won 3 more.
    d = play(d, rally('A'))
    const since = d.log.at(-1)!.id
    d = play(d, rally('A'), rally('A'))
    expect(servingRalliesInCurrentSet(d.setup, d.log, 'A').map(r => r.score)).toEqual(['4–1', '3–1', '2–1'])
    d = play(d, { type: 'wrong_server', team: 'A', when: 'discovered-later', sinceEventId: since })
    const set = stateOf(d).sets[0]
    expect(set.teams.A.score).toBe(1)
    expect(set.teams.A.cancelled).toBe(3)
    expect(set.teams.B.score).toBe(2)
    expect(set.serving).toBe('B')
  })

  it('positional fault by the receiving team: the server keeps serving and scores', () => {
    const s = stateOf(play(docOf(), start('A'), { type: 'rotation_fault', team: 'B' }))
    const set = s.sets[0]
    expect([set.teams.A.score, set.teams.B.score]).toEqual([1, 0])
    expect(set.serving).toBe('A')
    expect(set.teams.A.turns[0][0].points).toBe(1)
    expect(s.remarks[0]).toMatch(/out of rotation/)
  })

  it('positional fault by the serving team: side-out, the other team rotates', () => {
    const set = stateOf(play(docOf(), start('A'), rally('A'), { type: 'rotation_fault', team: 'A' })).sets[0]
    expect([set.teams.A.score, set.teams.B.score]).toEqual([1, 1])
    expect(set.serving).toBe('B')
    expect(set.teams.B.rotation).toBe(1)
  })

  it('caught before the serve: a note, no penalty', () => {
    const s = stateOf(play(docOf(), start('A'), { type: 'wrong_server', team: 'A', when: 'before-serve' }))
    expect(s.sets[0].teams.B.score).toBe(0)
    expect(s.remarks).toHaveLength(1)
  })
})

describe('corrections', () => {
  it('override makes the app match the scoreboard and notes the reason', () => {
    const s = stateOf(play(docOf(), start('A'), rally('A'), { type: 'override', reason: 'Scoreboard showed 5-3', score: { A: 5, B: 3 }, serving: 'B', rotation: { B: 2 } }))
    const set = s.sets[0]
    expect([set.teams.A.score, set.teams.B.score]).toEqual([5, 3])
    expect(set.serving).toBe('B')
    expect(serverOf(set.teams.B)).toBe(13)
    expect(s.remarks[0]).toMatch(/Reason: Scoreboard showed 5-3/)
  })

  it('end_set ends the set early with a winner (forfeit)', () => {
    const s = stateOf(play(docOf(), start('A'), rally('A'), { type: 'end_set', winner: 'B', reason: 'Team A could not field six players' }))
    expect(s.sets[0].winner).toBe('B')
    expect(s.setsWon.B).toBe(1)
  })

  it('a lineup with a repeated number is flagged', () => {
    const s = stateOf(play(docOf(), { ...start('A'), lineups: { A: [1, 1, 3, 4, 5, 6], B: LINEUP_B } } as ScoreEventInput))
    expect(s.warnings[0].code).toBe('lineup-invalid')
  })
})

describe('libero', () => {
  it('warns when the libero rotates to the front row', () => {
    // B serves first; A's libero replaces #5 (position V). A's side-out moves #5's spot to IV.
    const d = play(docOf(), start('B'), { type: 'libero_in', team: 'A', libero: 20, replaces: 5 }, rally('A'))
    const s = stateOf(d)
    expect(courtOf(s.sets[0].teams.A).find(c => c.libero)?.position).toBe(3)
    expect(s.warnings.map(w => w.code)).toEqual(['libero-front-row'])
  })

  it('USAV: a libero serves in one position only', () => {
    // A sides out, #2 rotates to serve, and the libero replaces #2 before the serve.
    let d = play(docOf(), start('B'), rally('A'), { type: 'libero_in', team: 'A', libero: 20, replaces: 2 })
    let s = stateOf(d)
    expect(serverOf(s.sets[0].teams.A)).toBe(20)
    expect(s.sets[0].teams.A.turns[1][0].server).toBe(20)
    expect(s.sets[0].teams.A.liberoServeSlot).toBe(1)
    expect(s.warnings).toHaveLength(0)
    // Later the libero serves for #3 (another position): warned.
    d = play(
      d,
      rally('B'),
      { type: 'libero_out', team: 'A', libero: 20 },
      { type: 'override', reason: 'test', serving: 'A', rotation: { A: 2 } },
      { type: 'libero_in', team: 'A', libero: 20, replaces: 3 },
    )
    s = stateOf(d)
    expect(s.warnings.map(w => w.code)).toContain('libero-serve')
  })

  it('international: the libero never serves', () => {
    const s = stateOf(play(docOf(setupOf('international')), start('B'), rally('A'), { type: 'libero_in', team: 'A', libero: 20, replaces: 2 }))
    expect(s.warnings.map(w => w.code)).toContain('libero-serve')
  })
})

describe('undo, redo and editing the past', () => {
  it('undo and redo walk the log', () => {
    let d = play(docOf(), start('A'), rally('A'), rally('B'))
    d = undo(d)
    expect(stateOf(d).sets[0].teams.B.score).toBe(0)
    expect(canRedo(d)).toBe(true)
    d = redo(d)
    expect(stateOf(d).sets[0].teams.B.score).toBe(1)
    d = undo(undo(undo(d)))
    expect(d.log).toHaveLength(0)
    expect(canUndo(d)).toBe(false)
  })

  it('a new tap after undo clears redo', () => {
    let d = undo(play(docOf(), start('A'), rally('A')))
    d = play(d, rally('B'))
    expect(canRedo(d)).toBe(false)
  })

  it('fixing a past rally replays everything after it, and the fix can be undone', () => {
    let d = play(docOf(), start('A'), rally('A'), rally('A'), rally('B'), rally('B'))
    const wrong = d.log[2].id
    d = editEvent(d, wrong, { winner: 'B' } as Partial<ScoreEventInput>)
    let set = stateOf(d).sets[0]
    expect([set.teams.A.score, set.teams.B.score]).toEqual([1, 3])
    expect(set.teams.B.rotation).toBe(1)
    d = undo(d)
    set = stateOf(d).sets[0]
    expect([set.teams.A.score, set.teams.B.score]).toEqual([2, 2])
  })

  it('a missed rally can be inserted and a mistaken one deleted', () => {
    let d = play(docOf(), start('A'), rally('A'), rally('A'))
    d = insertBefore(d, d.log[2].id, rally('B'))
    expect(stateOf(d).sets[0].serving).toBe('A')
    expect([stateOf(d).sets[0].teams.A.score, stateOf(d).sets[0].teams.B.score]).toEqual([2, 1])
    d = deleteEvent(d, d.log[1].id)
    expect(stateOf(d).sets[0].teams.A.score).toBe(1)
    d = undo(undo(d))
    expect(d.log.map(e => e.type)).toEqual(['set_start', 'rally', 'rally'])
  })
})

describe('saved copies', () => {
  it('loads the newest copy that reads back, skipping a torn write', () => {
    const doc = docOf()
    const older = JSON.stringify({ ...doc, seq: 4 })
    const newer = JSON.stringify({ ...doc, seq: 5, log: [{ id: 'x', at: 1, type: 'note', text: 'hi' }] })
    expect(pickNewest(older, newer)?.seq).toBe(5)
    expect(pickNewest(older, newer.slice(0, 40))?.seq).toBe(4)
    expect(pickNewest(null, 'garbage')).toBeNull()
  })
})
