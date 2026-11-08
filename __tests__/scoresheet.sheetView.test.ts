import { focusBox, focusGroups } from '../lib/scoresheet/sheetView'
import { SHEET_HEIGHT, SHEET_WIDTH } from '../lib/scoresheet/officialLayout'
import { fitText, helveticaMeasure } from '../lib/scoresheet/fitText'

describe('focusBox', () => {
  it('shows the whole sheet without a focus', () => {
    expect(focusBox(undefined)).toEqual({ x: 0, y: 0, w: SHEET_WIDTH, h: SHEET_HEIGHT })
  })

  it('pads a box, keeps it on the sheet, and gives a one-row strip some height', () => {
    const b = focusBox([{ x: 40, y: 144.5, w: 240, h: 14.4 }])
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.y + b.h).toBeLessThanOrEqual(SHEET_HEIGHT)
    expect(b.x).toBeLessThanOrEqual(40)
    expect(b.x + b.w).toBeGreaterThanOrEqual(280)
    expect(b.w / b.h).toBeLessThanOrEqual(2.2 + 1e-9)
  })

  it('widens a narrow column for context', () => {
    const b = focusBox([{ x: 300, y: 130, w: 30, h: 160 }])
    expect(b.w).toBeGreaterThanOrEqual(160 / 1.1 - 1e-9)
    expect(b.w).toBeGreaterThanOrEqual(240 - 1e-9)
  })
})

describe('focusGroups', () => {
  it('splits areas that are far apart and keeps near ones together', () => {
    const left = { x: 40, y: 144, w: 230, h: 14 }
    const right = { x: 360, y: 144, w: 230, h: 14 }
    expect(focusGroups([left, right])).toEqual([[left], [right]])
    const a = { x: 270, y: 130, w: 40, h: 150 }
    const b = { x: 315, y: 130, w: 40, h: 150 }
    expect(focusGroups([a, b])).toEqual([[a, b]])
  })
})

describe('fitText', () => {
  it('shrinks, then cuts with an ellipsis', () => {
    expect(fitText('Aces', 10, 100, helveticaMeasure)).toEqual({ text: 'Aces', size: 10 })
    const shrunk = fitText('A long competition name', 10, 80, helveticaMeasure)
    expect(shrunk.size).toBeLessThan(10)
    const cut = fitText('An extremely long competition name that cannot fit', 10, 60, helveticaMeasure)
    expect(cut.text.endsWith('…')).toBe(true)
    expect(helveticaMeasure(cut.text, cut.size)).toBeLessThanOrEqual(60)
  })
})
