import { replay } from '../lib/scoresheet/engine'
import { record } from '../lib/scoresheet/history'
import { MATCH_FORMATS, makeRules } from '../lib/scoresheet/rules'
import { parseRoster, rosterToText } from '../lib/scoresheet/roster'
import { scoresheetHtml } from '../lib/scoresheet/sheetHtml'
import { matchSummary, scoreLine, shareText } from '../lib/scoresheet/summary'
import type { MatchDoc, ScoreEventInput } from '../types/scoresheet'

describe('parseRoster', () => {
  it('reads numbers, names, libero and captain marks', () => {
    const { players, errors } = parseRoster('7 Jane Doe\n#12 Kim L\n3 Ana (C)\n15, 9 Al')
    expect(errors).toEqual([])
    expect(players).toEqual([
      { number: 3, name: 'Ana', captain: true },
      { number: 7, name: 'Jane Doe' },
      { number: 9, name: 'Al' },
      { number: 12, name: 'Kim', libero: true },
      { number: 15 },
    ])
    expect(parseRoster(rosterToText(players)).players).toEqual(players)
  })

  it('flags missing numbers and duplicates', () => {
    const { players, errors } = parseRoster('Jane\n4 Ann\n4 Bea')
    expect(players).toHaveLength(1)
    expect(errors).toHaveLength(2)
  })
})

describe('scoresheet output', () => {
  const setup = {
    info: { competition: 'Fall <Classic>', court: '3' },
    teams: {
      A: { name: 'Aces', players: [1, 2, 3, 4, 5, 6, 7].map(n => ({ number: n })) },
      B: { name: 'Blockers', players: [11, 12, 13, 14, 15, 16].map(n => ({ number: n })) },
    },
    rules: makeRules('usav', MATCH_FORMATS.twoSets),
  }
  let doc: MatchDoc = { id: 'x', createdAt: 0, updatedAt: 0, setup, log: [], undo: [], redo: [] }
  const add = (input: ScoreEventInput) => { doc = record(doc, input, 1_700_000_000_000 + doc.log.length * 30_000).doc }
  add({ type: 'set_start', lineups: { A: [1, 2, 3, 4, 5, 6], B: [11, 12, 13, 14, 15, 16] }, firstServe: 'A', liberos: { A: [], B: [] } })
  for (let i = 0; i < 25; i++) add({ type: 'rally', winner: i % 5 === 4 ? 'B' : 'A' })
  add({ type: 'sub', team: 'A', out: 3, in: 7 })
  add({ type: 'sanction', team: 'B', kind: 'warning', who: 12 })
  for (let i = 0; i < 8; i++) add({ type: 'rally', winner: 'A' })

  it('summarizes the match', () => {
    const state = replay(doc.setup, doc.log)
    expect(state.sets[0].winner).toBe('A')
    expect(scoreLine(state)).toMatch(/^1–0 · 25–/)
    // Pool play: set 2 hasn't started, so the match is still live.
    expect(matchSummary(doc, state).status).toBe('live')
    expect(shareText(doc, state)).toContain('Set 1: Aces 25')
  })

  it('renders an escaped, complete sheet', () => {
    const state = replay(doc.setup, doc.log)
    const html = scoresheetHtml(doc, state, 0)
    expect(html).toContain('Fall &lt;Classic&gt;')
    expect(html).not.toContain('<Classic>')
    expect(html).toContain('Set 1')
    expect(html).toContain('Sanctions')
    expect(html.match(/class="pt hit/g)?.length).toBeGreaterThanOrEqual(25)
  })
})
