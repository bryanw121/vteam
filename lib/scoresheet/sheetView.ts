import { SHEET_HEIGHT, SHEET_WIDTH } from './officialLayout'
import type { SheetRegion } from '../../types/scoresheet'

/** Room left around a focused area, in form points. */
const FOCUS_PAD = 14
/** A focused view never gets narrower than this, so there is context around a small box. */
const MIN_FOCUS_WIDTH = 240
/** …nor taller than wide by more than this, so a tall column still reads on a phone… */
const MAX_FOCUS_TALL = 1.1
/** …nor wider than tall by more than this, so a one-row strip shows the rows around it. */
const MAX_FOCUS_WIDE = 2.2
/** Wider than this, a step's separate areas are shown one view each (see `focusGroups`). */
export const SPLIT_FOCUS_WIDTH = 320

/**
 * The part of the form to show for `focus` (the whole sheet when empty): the areas'
 * bounding box with some room around it, at least MIN_FOCUS_WIDTH wide, kept on the
 * sheet. Pure, unit-tested.
 */
export function focusBox(focus: SheetRegion[] | undefined): SheetRegion {
  if (!focus?.length) return { x: 0, y: 0, w: SHEET_WIDTH, h: SHEET_HEIGHT }
  let x1 = Math.min(...focus.map(r => r.x)) - FOCUS_PAD
  let y1 = Math.min(...focus.map(r => r.y)) - FOCUS_PAD
  let x2 = Math.max(...focus.map(r => r.x + r.w)) + FOCUS_PAD
  let y2 = Math.max(...focus.map(r => r.y + r.h)) + FOCUS_PAD
  /** Widens [lo, hi] to at least `min`, around its centre, kept inside [0, max]. */
  const grow = (lo: number, hi: number, min: number, max: number): [number, number] => {
    if (hi - lo >= min) return [lo, hi]
    const c = (lo + hi) / 2
    let a = c - min / 2
    let b = c + min / 2
    if (a < 0) { b -= a; a = 0 }
    if (b > max) { a -= b - max; b = max }
    return [Math.max(0, a), b]
  }
  ;[x1, x2] = grow(x1, x2, MIN_FOCUS_WIDTH, SHEET_WIDTH)
  ;[x1, x2] = grow(x1, x2, (y2 - y1) / MAX_FOCUS_TALL, SHEET_WIDTH)
  ;[y1, y2] = grow(y1, y2, (x2 - x1) / MAX_FOCUS_WIDE, SHEET_HEIGHT)
  x1 = Math.max(0, x1)
  y1 = Math.max(0, y1)
  x2 = Math.min(SHEET_WIDTH, x2)
  y2 = Math.min(SHEET_HEIGHT, y2)
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

/**
 * How to show a step's areas: together when they sit close, one view per area when
 * together they would be too wide to read on a phone (the two teams' lineups, the
 * header and the date box).
 */
export function focusGroups(regions: SheetRegion[]): SheetRegion[][] {
  if (regions.length < 2) return [regions]
  const together = focusBox(regions)
  return together.w > SPLIT_FOCUS_WIDTH ? regions.map(r => [r]) : [regions]
}
