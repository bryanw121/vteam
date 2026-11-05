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
    expect(points.kind === 'big' && points.detail).toBe('Slash 1–25, then a line under 25 and down through 26–36')
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
    expect(steps.find(s => s.id === 'set1-points')!.sections[0]).toMatchObject({ detail: 'T-bar over 1–4: a line down from the top and a line under 4, slash 5–25, then a line under 25 and down through 26–36' })
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
    expect(pointsInstruction(0, 0, true)).toBe('Then a line down through every column')
    expect(pointsInstruction(7, 0, false, [3])).toBe('Slash 1–7, circle 3 (penalty point)')
    expect(pointsInstruction(4, 4, false)).toBe('T-bar over 1–4: a line down from the top and a line under 4')
  })
})

describe('service rounds', () => {
  it('marks box 1 X for the team receiving first, checks served boxes and circles final exit scores', () => {
    const m = matchOf(MATCH_FORMATS.oneSet)
    m.add(start('A'))
    // A serves 3 points, B sides out and scores 2, A sides out ... B wins the last rally on a side-out.
    for (const w of ['A', 'A', 'A', 'B', 'B', 'B', 'A'] as TeamSide[]) m.add({ type: 'rally', winner: w })
    let s = replay(m.doc.setup, m.doc.log)
    while (s.current != null) {
      const set = s.sets[0]
      const leader = set.teams.A.score >= 24 ? 'B' : 'A'
      m.add({ type: 'rally', winner: set.teams.A.score < 24 ? 'A' : leader })
      s = replay(m.doc.setup, m.doc.log)
    }
    const set = s.sets[0]
    const steps = copySteps(m.doc, s)
    const service = steps.find(x => x.id === 'set1-service')!.sections
    const right = service[1]
    // B received first: X in box 1 under position I.
    expect(right.kind === 'grid' && right.cells[0].value.startsWith('X')).toBe(true)
    const left = service[0]
    expect(left.kind === 'grid' && left.cells[0].value.startsWith('✓3')).toBe(true)
    // Exactly one circled (final) exit score per team.
    for (const g of [left, right]) if (g.kind === 'grid') expect(g.cells.map(c => c.value).join(' ').match(/\(\d+\)/g)).toHaveLength(1)
    expect(set.winner).toBeTruthy()
  })
})

describe('final service box', () => {
  it('records the final score unchecked when the set ends on a side-out', () => {
    const m = matchOf(MATCH_FORMATS.oneSet)
    m.add(start('A'))
    for (let i = 0; i < 24; i++) m.add({ type: 'rally', winner: 'A' })
    m.add({ type: 'rally', winner: 'B' }, { type: 'rally', winner: 'A' })
    const s = replay(m.doc.setup, m.doc.log)
    expect(s.sets[0].winner).toBe('A')
    const grid = copySteps(m.doc, s).find(x => x.id === 'set1-service')!.sections[0]
    const values = grid.kind === 'grid' ? grid.cells.map(c => c.value) : []
    // Server I: served, lost at 24 (checked). Server II: never served, final 25 unchecked and circled.
    expect(values[0]).toBe('✓24')
    expect(values[1]).toBe('(25)')
    const b = copySteps(m.doc, s).find(x => x.id === 'set1-service')!.sections[1]
    expect(b.kind === 'grid' && b.cells.map(c => c.value).slice(0, 2)).toEqual(['X', '✓(1)'])
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
