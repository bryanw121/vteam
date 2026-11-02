import { replay } from '../lib/scoresheet/engine'
import { record } from '../lib/scoresheet/history'
import { MATCH_FORMATS, makeRules } from '../lib/scoresheet/rules'
import { scoresheetHtml } from '../lib/scoresheet/sheetHtml'
import { matchSummary, scoreLine, shareText } from '../lib/scoresheet/summary'
import type { MatchDoc, ScoreEventInput } from '../types/scoresheet'

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
