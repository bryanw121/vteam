import { courtOf, isFrontRow, replay } from './engine'
import { record } from './history'
import { MATCH_FORMATS, makeRules } from './rules'
import type { MatchDoc, RosterPlayer, ScoreEventInput, TeamSide } from '../../types/scoresheet'

/**
 * A finished example match, so someone trying the Scorekeeper can see what they
 * end up with (the finished scoresheet, the official USA Volleyball form, Copy to
 * paper) before scoring a real one. Built through the same log and engine as a
 * real match, so it is exactly what the app produces: best of three, won 2–0,
 * with time-outs, substitutions, liberos (the Aces' libero serving for their middle, triangled on the form) and a sanction. Deterministic.
 */
export const EXAMPLE_MATCH_ID = 'example'

const roster = (numbers: number[], names: string[], libero: number): RosterPlayer[] =>
  numbers.map((number, i) => ({ number, name: names[i], captain: i === 0, libero: number === libero }))

/** The Aces' middle, whom their libero serves for (USAV: one serving position per set). */
const ACES_MIDDLE_SLOT = 5

/** Position V (0-based 4): the next rotation takes it to the front row. */
const LIBERO_LAST_BACK_ROW = 4

/** Rally winners per set (0 = the set's winner), in a fixed order: a clear first set, a closer second. */
const PATTERNS = [
  [0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0],
  [1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0],
]

export function exampleMatch(now = Date.now()): MatchDoc {
  const date = new Date(now)
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  let doc: MatchDoc = {
    id: EXAMPLE_MATCH_ID,
    example: true,
    createdAt: now,
    updatedAt: now,
    setup: {
      info: {
        competition: 'Example: Fall Classic',
        matchNo: '7',
        division: '18 Open',
        city: 'Austin, TX',
        court: '3',
        date: iso,
        gender: 'women',
        firstReferee: 'J. Rivera',
        scorer: 'You',
      },
      teams: {
        A: { name: 'Aces', players: roster([7, 2, 4, 9, 11, 13, 5, 15], ['M. Chen', 'A. Ortiz', 'P. Patel', 'L. Nguyen', 'S. Brooks', 'K. Hale', 'R. Diaz', 'T. Moore'], 15) },
        B: { name: 'Blockers', players: roster([10, 3, 6, 8, 12, 14, 1, 21], ['D. Kim', 'E. Ward', 'H. Lopez', 'J. Fox', 'N. Reed', 'O. Shaw', 'C. Bell', 'G. Park'], 21) },
      },
      rules: makeRules('usav', MATCH_FORMATS.bestOf3),
    },
    log: [],
    undo: [],
    redo: [],
  }
  // Rallies take about 40 s, so the start and end times on the sheet look like a real match.
  let clock = now - 50 * 60_000
  const add = (...inputs: ScoreEventInput[]) => {
    for (const input of inputs) doc = record(doc, input, (clock += 40_000)).doc
  }
  const score = () => {
    const s = replay(doc.setup, doc.log)
    const set = s.current != null ? s.sets[s.current] : null
    return { over: s.current == null, a: set?.teams.A.score ?? 0, b: set?.teams.B.score ?? 0 }
  }
  /** Plays the set to its end in `pattern`; `at` adds events before the given rally (0-based). */
  const playSet = (favourite: TeamSide, pattern: number[], at: Record<number, ScoreEventInput[]> = {}) => {
    const underdog: TeamSide = favourite === 'A' ? 'B' : 'A'
    for (let i = 0; i < 120; i++) {
      const now = score()
      if (now.over) return
      if (at[i]) add(...at[i])
      // A libero in position V would rotate to the front row on the next side-out: the regular player comes back first.
      const before = replay(doc.setup, doc.log)
      if (before.current != null) {
        for (const side of ['A', 'B'] as const) {
          const team = before.sets[before.current].teams[side]
          const libero = courtOf(team).find(p => p.libero && (p.position === LIBERO_LAST_BACK_ROW || isFrontRow(p.position)))
          if (libero) add({ type: 'libero_out', team: side, libero: libero.player })
        }
      }
      // The Aces' libero serves for their middle (lineup slot VI): in for them each time that slot reaches position I.
      const now2 = replay(doc.setup, doc.log)
      if (now2.current != null) {
        const aces = now2.sets[now2.current].teams.A
        const server = courtOf(aces).find(p => p.position === 0)
        if (server && !server.libero && server.slot === ACES_MIDDLE_SLOT && !aces.libero) add({ type: 'libero_in', team: 'A', libero: 15, replaces: server.player })
      }
      add({ type: 'rally', winner: pattern[i % pattern.length] === 0 ? favourite : underdog })
    }
  }

  add({ type: 'set_start', lineups: { A: [7, 2, 4, 9, 11, 13], B: [10, 3, 6, 8, 12, 14] }, firstServe: 'A', liberos: { A: [15], B: [21] } })
  playSet('A', PATTERNS[0], {
    // #14 starts in position VI (back row).
    0: [{ type: 'libero_in', team: 'B', libero: 21, replaces: 14 }],
    14: [{ type: 'timeout', team: 'B' }],
    21: [{ type: 'sub', team: 'B', out: 6, in: 1 }],
    28: [{ type: 'sanction', team: 'B', kind: 'delay-warning' }],
    33: [{ type: 'sub', team: 'B', out: 1, in: 6 }],
  })
  add({ type: 'set_start', lineups: { A: [7, 2, 4, 9, 11, 13], B: [10, 3, 6, 8, 12, 14] }, firstServe: 'B', liberos: { A: [15], B: [21] } })
  playSet('A', PATTERNS[1], {
    12: [{ type: 'timeout', team: 'A' }],
    24: [{ type: 'sub', team: 'A', out: 13, in: 5 }],
    36: [{ type: 'timeout', team: 'B' }],
  })
  return { ...doc, updatedAt: clock }
}
