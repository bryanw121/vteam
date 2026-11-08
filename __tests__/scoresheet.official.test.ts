import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { replay } from '../lib/scoresheet/engine'
import { record } from '../lib/scoresheet/history'
import { officialLayout, wrap } from '../lib/scoresheet/officialLayout'
import { officialFileName, officialScoresheetPdf } from '../lib/scoresheet/officialPdf'
import { MATCH_FORMATS, makeRules, withOptions } from '../lib/scoresheet/rules'
import { USAV_TWO_SET_TEMPLATE } from '../lib/scoresheet/usavTemplate'
import type { MatchDoc, MatchFormat, ScoreEventInput, SheetOp, TeamSide } from '../types/scoresheet'

/** Rough Helvetica width, enough for wrapping tests. */
const measure = (text: string, size: number) => text.length * size * 0.5

function matchOf(format: MatchFormat): { doc: MatchDoc; add: (...inputs: ScoreEventInput[]) => void } {
  const players = (nums: number[]) => nums.map((n, i) => ({ number: n, captain: i === 0, libero: n === 20 || n === 30 }))
  let doc: MatchDoc = {
    id: 'm',
    createdAt: 0,
    updatedAt: 0,
    setup: {
      info: { competition: 'Lone Star Classic', city: 'Austin, TX', court: '4', date: '2026-11-02', gender: 'coed', matchNo: '12', division: 'Open', firstReferee: 'R. One', scorer: 'S. Corer' },
      teams: { A: { name: 'Aces', players: players([1, 2, 3, 4, 5, 6, 7, 8, 20]) }, B: { name: 'Blockers', players: players([11, 12, 13, 14, 15, 16, 17, 30]) } },
      rules: makeRules('usav', format),
    },
    log: [],
    undo: [],
    redo: [],
  }
  let clock = new Date(2026, 10, 2, 9, 0).getTime()
  return { get doc() { return doc }, add: (...inputs) => { for (const i of inputs) doc = record(doc, i, (clock += 40_000)).doc } }
}

const start = (firstServe: TeamSide): ScoreEventInput => ({ type: 'set_start', lineups: { A: [1, 2, 3, 4, 5, 6], B: [11, 12, 13, 14, 15, 16] }, firstServe, liberos: { A: [20], B: [30] } })
/** Plays rallies until the set ends, `winner` taking two of every three. */
function playSet(m: ReturnType<typeof matchOf>, winner: TeamSide) {
  const loser: TeamSide = winner === 'A' ? 'B' : 'A'
  for (let i = 0; i < 200; i++) {
    const s = replay(m.doc.setup, m.doc.log)
    if (s.current == null) return
    m.add({ type: 'rally', winner: i % 3 === 2 ? loser : winner })
  }
}

const texts = (ops: SheetOp[], page = 0) => ops.filter((o): o is Extract<SheetOp, { kind: 'text' }> => o.kind === 'text' && o.page === page).map(o => o.text)

describe('official USAV scoresheet', () => {
  it('embeds the blank form unchanged', () => {
    const file = readFileSync(join(__dirname, '../assets/scoresheet/usav-2-set-scoresheet.pdf'))
    expect(Buffer.from(USAV_TWO_SET_TEMPLATE, 'base64').equals(file)).toBe(true)
  })

  it('fills one sheet for a one-set match and marks the second block not played', () => {
    const m = matchOf(MATCH_FORMATS.oneSet)
    m.add(start('A'))
    playSet(m, 'A')
    const state = replay(m.doc.setup, m.doc.log)
    expect(state.over).toBe(true)
    expect(state.winner).toBe('A')
    expect(state.sets[0].courtSwitchAt).toBeNull()
    const layout = officialLayout(m.doc, state, { measure })
    expect(layout.pages).toEqual(['form'])
    const t = texts(layout.ops)
    expect(t).toContain('Not played')
    expect(t).toContain('Lone Star Classic')
    expect(t).toContain('11/02/2026')
    // Starters: every lineup number is written.
    for (const n of ['1', '2', '3', '4', '5', '6', '11', '12', '13', '14', '15', '16']) expect(t).toContain(n)
    // One slash per rally point (team A's 25, team B's points), before the closing lines.
    const slashes = layout.ops.filter(o => o.kind === 'line' && o.x2 - o.x1 > 6 && o.y1 > o.y2 && o.x1 > 270 && o.x2 < 356)
    expect(slashes.length).toBe(state.sets[0].teams.A.score + state.sets[0].teams.B.score)
  })

  it('continues a best-of-3 onto a second sheet, with sets starting at 4–4 crossed out', () => {
    const m = matchOf(withOptions(MATCH_FORMATS.bestOf3, { start: 4, cap: 27 }))
    m.add(start('A'))
    for (let i = 0; i < 6; i++) m.add({ type: 'rally', winner: 'A' })
    m.add({ type: 'timeout', team: 'B' }, { type: 'sub', team: 'B', out: 13, in: 17 }, { type: 'sanction', team: 'B', kind: 'delay-warning' }, { type: 'sanction', team: 'A', kind: 'warning', who: 2 })
    playSet(m, 'B')
    m.add(start('B'))
    playSet(m, 'A')
    m.add(start('A'))
    playSet(m, 'A')
    const state = replay(m.doc.setup, m.doc.log)
    expect(state.sets).toHaveLength(3)
    const layout = officialLayout(m.doc, state, { measure })
    expect(layout.pages).toEqual(['form', 'form'])
    // Four relabels (Set 3 / Set 4 and their results) plus the "Not played" label on set 4's block.
    expect(layout.ops.filter(o => o.kind === 'cover' && o.page === 1)).toHaveLength(5)
    expect(texts(layout.ops, 1)).toContain('3')
    expect(texts(layout.ops, 0).join(' ')).toContain('Continued on sheet 2 (set 3).')
    expect(texts(layout.ops, 0).join(' ')).toContain('Set 1 started at 4–4')
    expect(texts(layout.ops, 1).join(' ')).toContain('Sheet 2 of 2.')
    // Substitute 17 and the time-out score are written in set 1's block.
    expect(texts(layout.ops)).toContain('17')
    // Delay warning is a "D" in the sanction table.
    expect(texts(layout.ops)).toContain('D')
  })

  it('moves remarks that overflow the form onto a plain page', () => {
    const m = matchOf(MATCH_FORMATS.oneSet)
    m.add(start('A'))
    for (let i = 0; i < 30; i++) m.add({ type: 'note', text: `Remark number ${i} about something that happened on court during the rally.` })
    const layout = officialLayout(m.doc, replay(m.doc.setup, m.doc.log), { measure })
    expect(layout.pages).toEqual(['form', 'plain'])
    expect(texts(layout.ops, 1)[0]).toMatch(/^Remarks \(continued\)/)
  })

  it('wraps long words', () => {
    expect(wrap('a bb cccccccccc', 20, 4, measure)).toEqual(['a bb', 'cccccccccc'])
    expect(wrap('x'.repeat(30), 20, 4, measure).every(l => measure(l, 4) <= 20)).toBe(true)
  })

  it('writes a PDF with one page per sheet', async () => {
    const m = matchOf(MATCH_FORMATS.bestOf3)
    m.add(start('A'))
    m.add({ type: 'sub', team: 'A', out: 3, in: 7 }, { type: 'timeout', team: 'A' })
    playSet(m, 'A')
    m.add(start('B'))
    playSet(m, 'B')
    m.add(start('A'))
    playSet(m, 'A')
    m.add({ type: 'note', text: 'Emoji 🏐 and ünïcode are kept or replaced, never thrown on.' })
    const state = replay(m.doc.setup, m.doc.log)
    const bytes = await officialScoresheetPdf(m.doc, state)
    const out = await PDFDocument.load(bytes)
    expect(out.getPageCount()).toBe(2)
    expect(out.getPage(0).getRotation().angle).toBe(90)
    expect(officialFileName(m.doc)).toBe('Aces-vs-Blockers-2026-11-02-usav-scoresheet.pdf')
    if (process.env.OFFICIAL_PDF_OUT) writeFileSync(process.env.OFFICIAL_PDF_OUT, bytes)
  })

  it('triangles the Roman numeral and the points when a libero serves (S6.2)', () => {
    const m = matchOf(MATCH_FORMATS.oneSet)
    m.add(start('A'))
    // Team A's server is #1 in position I: the libero replaces them and serves three points, then loses the rally.
    m.add({ type: 'libero_in', team: 'A', libero: 20, replaces: 1 }, { type: 'rally', winner: 'A' }, { type: 'rally', winner: 'A' }, { type: 'rally', winner: 'A' }, { type: 'rally', winner: 'B' })
    const state = replay(m.doc.setup, m.doc.log)
    const a = state.sets[0].teams.A
    expect(a.liberoServeSlot).toBe(0)
    expect(a.liberoPoints).toEqual([1, 2, 3])
    expect(state.sets[0].teams.B.liberoPoints).toEqual([])
    const ops = officialLayout(m.doc, state, { measure }).ops
    // A triangle is three lines meeting at an apex: the Roman numeral I plus points 1–3.
    const rising = (spread: number) => ops.filter(o => o.kind === 'line' && o.width === 0.8 && o.x2 > o.x1 && o.y2 > o.y1 && Math.abs((o.x2 - o.x1) / (o.y2 - o.y1) - spread / 1.62) < 0.01)
    expect(rising(1.5)).toHaveLength(1) // Roman numeral I
    expect(rising(0.95)).toHaveLength(3) // points 1–3
  })
})
