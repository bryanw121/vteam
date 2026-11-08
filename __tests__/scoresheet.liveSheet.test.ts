import { exampleMatch } from '../lib/scoresheet/exampleMatch'
import { replay } from '../lib/scoresheet/engine'
import { officialLayout, SET_DY } from '../lib/scoresheet/officialLayout'
import { redo, undo } from '../lib/scoresheet/history'
import { helveticaMeasure } from '../lib/scoresheet/fitText'
import { diffMarks, followFocus, mergeBoxes, opKeys, setArea } from '../lib/scoresheet/liveSheet'
import type { MatchDoc, OfficialSheetLayout } from '../types/scoresheet'

const lay = (doc: MatchDoc): OfficialSheetLayout => officialLayout(doc, replay(doc.setup, doc.log), { measure: helveticaMeasure })
const sorted = <T>(xs: T[]) => [...xs].map(x => JSON.stringify(x)).sort()

/** The example match taken back `n` taps (a set in play), with its redo stack to go forward. */
function midMatch(n = 6): MatchDoc {
  let doc = exampleMatch(Date.UTC(2026, 10, 8, 18)) as MatchDoc
  for (let i = 0; i < n; i++) doc = undo(doc) as MatchDoc
  return doc
}

describe('setArea', () => {
  it('puts sets 1–2 on the first form and 3–4 on the next, in the top or bottom block', () => {
    expect(setArea(0)).toEqual({ page: 0, region: expect.objectContaining({ y: 104.5 }) })
    expect(setArea(1).page).toBe(0)
    expect(setArea(1).region.y).toBeCloseTo(104.5 + SET_DY)
    expect(setArea(2)).toEqual({ page: 1, region: setArea(0).region })
  })
})

describe('opKeys', () => {
  it('is the same for the same layout and unique within one', () => {
    const doc = midMatch()
    const keys = opKeys(lay(doc).ops)
    expect(new Set(keys).size).toBe(keys.length)
    expect(opKeys(lay(doc).ops)).toEqual(keys)
  })
})

describe('diffMarks', () => {
  const page = (doc: MatchDoc) => setArea(replay(doc.setup, doc.log).current ?? 0).page

  it('shows nothing when nothing changed, or with no previous sheet', () => {
    const doc = midMatch()
    const l = lay(doc)
    expect(diffMarks(l, lay(doc), 0, helveticaMeasure)).toEqual({ added: [], removed: [] })
    expect(diffMarks(null, l, 0, helveticaMeasure)).toEqual({ added: [], removed: [] })
  })

  it('a rally adds marks; undoing it erases exactly those; redoing writes them back', () => {
    const before = midMatch()
    const after = redo(before) as MatchDoc
    const p = page(before)
    const forward = diffMarks(lay(before), lay(after), p, helveticaMeasure)
    expect(forward.added.length).toBeGreaterThan(0)
    // Undo is the same change backwards: what was added is what's erased, and the other way round.
    const back = diffMarks(lay(after), lay(before), p, helveticaMeasure)
    expect(sorted(back.removed)).toEqual(sorted(forward.added))
    expect(sorted(back.added)).toEqual(sorted(forward.removed))
    // Redo after the undo: the same marks again.
    const again = diffMarks(lay(before), lay(redo(undo(after) as MatchDoc) as MatchDoc), p, helveticaMeasure)
    expect(sorted(again.added)).toEqual(sorted(forward.added))
  })

  it('stays inside the form', () => {
    const before = midMatch()
    const d = diffMarks(lay(before), lay(redo(before) as MatchDoc), page(before), helveticaMeasure)
    for (const r of [...d.added, ...d.removed]) {
      expect(r.x).toBeGreaterThan(-5)
      expect(r.y).toBeGreaterThan(-5)
      expect(r.x + r.w).toBeLessThan(800)
      expect(r.y + r.h).toBeLessThan(620)
    }
  })
})

describe('followFocus', () => {
  it('follows what was written, else what was erased, else stays put', () => {
    const a = { x: 300, y: 200, w: 10, h: 10 }
    expect(followFocus({ added: [a], removed: [] })).toEqual([a])
    expect(followFocus({ added: [], removed: [a] })).toEqual([a])
    expect(followFocus({ added: [], removed: [] })).toBeNull()
  })

  it('on areas too far apart to read together, picks the one nearest the running score', () => {
    const service = { x: 40, y: 280, w: 30, h: 12 }
    const running = { x: 305, y: 200, w: 10, h: 10 }
    const far = { x: 560, y: 120, w: 20, h: 10 }
    expect(followFocus({ added: [service, running, far], removed: [] })).toEqual([running])
  })

  it('every rally of the example gives a phone-readable focus', () => {
    let doc = midMatch(40)
    for (let i = 0; i < 40; i++) {
      const next = redo(doc) as MatchDoc
      const f = followFocus(diffMarks(lay(doc), lay(next), setArea(replay(next.setup, next.log).current ?? 0).page, helveticaMeasure))
      if (f) expect(Math.max(...f.map(r => r.x + r.w)) - Math.min(...f.map(r => r.x))).toBeLessThanOrEqual(320)
      doc = next
    }
  })
})

describe('mergeBoxes', () => {
  it('joins touching boxes and keeps apart ones', () => {
    expect(mergeBoxes([{ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 10, h: 10 }])).toEqual([{ x: 0, y: 0, w: 21, h: 10 }])
    expect(mergeBoxes([{ x: 0, y: 0, w: 10, h: 10 }, { x: 50, y: 0, w: 10, h: 10 }])).toHaveLength(2)
  })
})
