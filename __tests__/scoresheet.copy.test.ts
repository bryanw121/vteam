import { replay } from '../lib/scoresheet/engine'
import { record } from '../lib/scoresheet/history'
import { copySteps, pointsInstruction, resumeIndex } from '../lib/scoresheet/copySteps'
import { carryOver, mergeTeams, MAX_SAVED_TEAMS } from '../lib/scoresheet/teamStore'
import { MATCH_FORMATS, makeRules, withOptions } from '../lib/scoresheet/rules'
import type { CopySection, MatchDoc, MatchFormat, ScoreEventInput, SavedTeam, TeamSide } from '../types/scoresheet'

function matchOf(format: MatchFormat) {
  let doc: MatchDoc = {
    id: 'm', createdAt: 0, updatedAt: 0, log: [], undo: [], redo: [],
    setup: {
      info: { date: '2026-11-02', court: '3' },
      teams: { A: { name: 'Aces', players: [1, 2, 3, 4, 5, 6, 7].map((n, i) => ({ number: n, captain: i === 0 })) }, B: { name: 'Blockers', players: [11, 12, 13, 14, 15, 16].map(n => ({ number: n })) } },
      rules: makeRules('usav', format),
    },
  }
  let clock = new Date(2026, 10, 2, 18, 0).getTime()
  const add = (...xs: ScoreEventInput[]) => { for (const x of xs) doc = record(doc, x, (clock += 30_000)).doc }
  return { get doc() { return doc }, add }
}
const start = (firstServe: TeamSide): ScoreEventInput => ({ type: 'set_start', lineups: { A: [1, 2, 3, 4, 5, 6], B: [11, 12, 13, 14, 15, 16] }, firstServe, liberos: { A: [], B: [] } })
const win = (m: ReturnType<typeof matchOf>, t: TeamSide) => { while (replay(m.doc.setup, m.doc.log).current != null) m.add({ type: 'rally', winner: t }) }
const rowsOf = (s: CopySection[]) => s.flatMap(x => (x.kind === 'rows' ? x.rows : []))

describe('copy to paper', () => {
  it('walks a one-set match in paper order, skipping empty parts', () => {
    const m = matchOf(MATCH_FORMATS.oneSet)
    m.add(start('A'))
    win(m, 'A')
    const steps = copySteps(m.doc, replay(m.doc.setup, m.doc.log))
    expect(steps.map(s => s.id)).toEqual(['header', 'set1-teams', 'set1-lineup', 'set1-points', 'set1-service', 'set1-end', 'results', 'officials'])
    const lineup = steps.find(s => s.id === 'set1-lineup')!.sections[0]
    expect(lineup.kind === 'grid' && lineup.cells.map(c => c.value)).toEqual(['1', '2', '3', '4', '5', '6'])
    const points = steps.find(s => s.id === 'set1-points')!.sections[0]
    expect(points.kind === 'big' && points.detail).toBe('Slash 1–25, circle 25, line off 26–36')
    const results = rowsOf(steps.find(s => s.id === 'results')!.sections)
    expect(results.some(r => r.value === 'Not played: draw a line through it')).toBe(true)
    expect(rowsOf(steps[0].sections).find(r => r.label === 'Date')?.value).toBe('11/02/2026')
  })

  it('puts set 2 with B on the left, set 3 on sheet 2, and lists subs, sanctions and remarks', () => {
    const m = matchOf(withOptions(MATCH_FORMATS.bestOf3, { start: 4, cap: 27 }))
    m.add(start('A'), { type: 'sub', team: 'A', out: 3, in: 7 }, { type: 'sanction', team: 'B', kind: 'delay-warning' })
    win(m, 'A')
    m.add(start('B'))
    win(m, 'B')
    m.add(start('A'))
    win(m, 'A')
    const steps = copySteps(m.doc, replay(m.doc.setup, m.doc.log))
    const subs = steps.find(s => s.id === 'set1-subs')!
    expect(rowsOf(subs.sections)[0].value).toMatch(/^#7 in · 4 : 4/)
    const set2 = steps.find(s => s.id === 'set2-lineup')!.sections[0]
    expect(set2.kind === 'grid' && set2.title).toBe('Left · Blockers')
    expect(steps.find(s => s.id === 'set3-lineup')!.sheet).toBe(2)
    expect(steps.find(s => s.id === 'set1-points')!.sections[0]).toMatchObject({ detail: 'Cross out 1–4 (the set started at 4), slash 5–25, circle 25, line off 26–36' })
    expect(rowsOf(steps.find(s => s.id === 'sanctions')!.sections)[0].value).toMatch(/^"D" under W · set 1/)
    expect(rowsOf(steps.find(s => s.id === 'remarks')!.sections).map(r => r.value)).toContain('Continued on sheet 2 (set 3).')
  })

  it('resumes at the first step not ticked', () => {
    const m = matchOf(MATCH_FORMATS.oneSet)
    m.add(start('A'))
    const steps = copySteps(m.doc, replay(m.doc.setup, m.doc.log))
    expect(resumeIndex(steps, [])).toBe(0)
    expect(resumeIndex(steps, ['header', 'set1-teams'])).toBe(2)
    expect(resumeIndex(steps, steps.map(s => s.id))).toBe(steps.length - 1)
  })

  it('describes points for unfinished and zero scores', () => {
    expect(pointsInstruction(0, 0, true)).toBe('Line off 1–36')
    expect(pointsInstruction(7, 0, false)).toBe('Slash 1–7')
    expect(pointsInstruction(4, 4, false)).toBe('Cross out 1–4 (the set started at 4)')
  })
})

describe('saved teams', () => {
  const team = (name: string, updatedAt: number): SavedTeam => ({ name, court: [], bench: [], updatedAt })
  it('keeps the newest copy of each team, newest first, and skips placeholder names', () => {
    const merged = mergeTeams([team('Aces', 1), team('Blockers', 2)], [team('aces', 5), team('Team A', 5)])
    expect(merged.map(t => t.name)).toEqual(['aces', 'Blockers'])
  })
  it('keeps at most MAX_SAVED_TEAMS', () => {
    const many = Array.from({ length: MAX_SAVED_TEAMS + 5 }, (_, i) => team(`T${i}`, i))
    expect(mergeTeams([], many)).toHaveLength(MAX_SAVED_TEAMS)
  })
  it('carries over the tournament details, not this match\'s', () => {
    expect(carryOver({ competition: 'Open', court: '2', matchNo: '7', date: '2026-11-02', gender: 'men', scorer: ' ' })).toEqual({ competition: 'Open', court: '2' })
  })
})
