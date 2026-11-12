import { findShowableStep, isRectOnScreen, placeTourCard, scrimRects, spotlightRect, tourCardWidth, TOUR_CARD_GAP, TOUR_EDGE_MARGIN } from '../utils/tour'
import { TOURS } from '../constants/tours'

const viewport = { width: 390, height: 844 }
const noInsets = { top: 0, right: 0, bottom: 0, left: 0 }

describe('findShowableStep', () => {
  it('returns the first showable index walking forward, skipping the rest', async () => {
    const shown = new Set([0, 3])
    expect(await findShowableStep(5, 1, 1, i => shown.has(i))).toBe(3)
  })
  it('walks backward', async () => {
    expect(await findShowableStep(5, 3, -1, i => i === 1)).toBe(1)
  })
  it('returns null off either end', async () => {
    expect(await findShowableStep(3, 1, 1, () => false)).toBeNull()
    expect(await findShowableStep(3, 1, -1, () => false)).toBeNull()
    expect(await findShowableStep(3, 3, 1, () => true)).toBeNull()
  })
  it('accepts async checks and stops at the first hit', async () => {
    const seen: number[] = []
    const found = await findShowableStep(4, 0, 1, async i => { seen.push(i); return i === 2 })
    expect(found).toBe(2)
    expect(seen).toEqual([0, 1, 2])
  })
})

describe('isRectOnScreen', () => {
  it('needs a size and a centre inside the viewport', () => {
    expect(isRectOnScreen({ x: 10, y: 10, width: 50, height: 20 }, viewport)).toBe(true)
    expect(isRectOnScreen({ x: 0, y: 0, width: 0, height: 0 }, viewport)).toBe(false) // display: none
    expect(isRectOnScreen({ x: 10, y: 900, width: 50, height: 20 }, viewport)).toBe(false)
    expect(isRectOnScreen({ x: 10, y: -60, width: 50, height: 20 }, viewport)).toBe(false)
    expect(isRectOnScreen(null, viewport)).toBe(false)
  })
})

describe('spotlight', () => {
  it('pads the target and clamps to the viewport', () => {
    expect(spotlightRect({ x: 2, y: 100, width: 50, height: 20 }, viewport, 6)).toEqual({ x: 0, y: 94, width: 58, height: 32 })
  })
  it('scrim rects tile the screen around the cutout', () => {
    const spot = { x: 100, y: 200, width: 50, height: 40 }
    const rects = scrimRects(spot, viewport)
    const area = rects.reduce((sum, r) => sum + r.width * r.height, 0)
    expect(area + spot.width * spot.height).toBe(viewport.width * viewport.height)
  })
})

describe('placeTourCard', () => {
  const card = { width: 300, height: 160 }

  it('goes below a target near the top, arrow pointing at its centre', () => {
    const spot = { x: 20, y: 100, width: 60, height: 40 }
    const pos = placeTourCard({ spot, card, viewport, insets: noInsets })
    expect(pos.side).toBe('bottom')
    expect(pos.y).toBe(140 + TOUR_CARD_GAP)
    expect(pos.x).toBe(TOUR_EDGE_MARGIN) // clamped to the left edge
    expect(pos.x + pos.arrowX).toBe(50) // target centre
  })

  it('goes above a target near the bottom (the tab bar)', () => {
    const spot = { x: 300, y: 780, width: 60, height: 50 }
    const pos = placeTourCard({ spot, card, viewport, insets: noInsets })
    expect(pos.side).toBe('top')
    expect(pos.y).toBe(780 - TOUR_CARD_GAP - 160)
    expect(pos.x + card.width).toBeLessThanOrEqual(viewport.width - TOUR_EDGE_MARGIN)
  })

  it('keeps the arrow off the card corners', () => {
    const spot = { x: 0, y: 100, width: 10, height: 10 }
    const pos = placeTourCard({ spot, card, viewport, insets: noInsets })
    expect(pos.arrowX).toBeGreaterThanOrEqual(20)
  })

  it('honours a forced placement unless it cannot fit', () => {
    const spot = { x: 100, y: 400, width: 60, height: 40 }
    expect(placeTourCard({ spot, card, viewport, insets: noInsets, placement: 'top' }).side).toBe('top')
    const nearTop = { x: 100, y: 20, width: 60, height: 40 }
    expect(placeTourCard({ spot: nearTop, card, viewport, insets: noInsets, placement: 'top' }).side).toBe('bottom')
  })

  it('respects safe-area insets', () => {
    const insets = { top: 47, right: 0, bottom: 34, left: 0 }
    const spot = { x: 100, y: 0, width: 60, height: 20 }
    const pos = placeTourCard({ spot, card, viewport, insets })
    expect(pos.y).toBeGreaterThanOrEqual(insets.top + TOUR_EDGE_MARGIN)
  })

  it('card width never exceeds the screen minus margins', () => {
    expect(tourCardWidth(320, noInsets)).toBe(320 - 2 * TOUR_EDGE_MARGIN)
    expect(tourCardWidth(1280, noInsets)).toBe(340)
  })
})

describe('TOURS', () => {
  it('every step has a target, a title and a short body (at most three sentences)', () => {
    for (const tour of Object.values(TOURS)) {
      expect(tour.steps.length).toBeGreaterThan(0)
      for (const step of tour.steps) {
        expect(step.target).toBeTruthy()
        expect(step.title).toBeTruthy()
        expect(step.body.split(/[.!?](\s|$)/).filter(s => s && s.trim()).length).toBeLessThanOrEqual(3)
        expect(step.body.length).toBeLessThanOrEqual(140)
      }
    }
  })
})
