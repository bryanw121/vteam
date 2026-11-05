import type { TourCardPosition, TourInsets, TourPlacement, TourRect, TourSize } from '../types'

/**
 * Pure helpers behind the guided tour (contexts/tour.tsx): which step to show
 * next, whether a measured target is on screen, and where the card and its
 * arrow go. No React here, so the logic is unit-tested directly.
 */

/** Space around the target inside the spotlight cutout. */
export const TOUR_SPOTLIGHT_PADDING = 6
/** Minimum distance between the card and the screen edge (after safe-area insets). */
export const TOUR_EDGE_MARGIN = 16
/** Gap between the spotlight and the card; the arrow sits in it. */
export const TOUR_CARD_GAP = 14
/** Side of the arrow's square before it's rotated 45 degrees. */
export const TOUR_ARROW_SIZE = 14
export const TOUR_CARD_MAX_WIDTH = 340
/** Keeps the arrow off the card's rounded corners. */
const ARROW_CORNER_CLEARANCE = 22

/**
 * First step index from `from` (inclusive), walking in `dir`, for which
 * `canShow` resolves true; null when it runs off either end. `canShow` is where
 * the caller switches tabs and waits for the target to appear.
 */
export async function findShowableStep(
  count: number,
  from: number,
  dir: 1 | -1,
  canShow: (index: number) => boolean | Promise<boolean>,
): Promise<number | null> {
  for (let i = from; i >= 0 && i < count; i += dir) {
    if (await canShow(i)) return i
  }
  return null
}

/** True when the rect has a size and its centre is inside the viewport (display:none and off-screen targets fail). */
export function isRectOnScreen(rect: TourRect | null | undefined, viewport: TourSize): boolean {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return false
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  return cx >= 0 && cx <= viewport.width && cy >= 0 && cy <= viewport.height
}

export function sameRect(a: TourRect | null, b: TourRect | null): boolean {
  if (!a || !b) return a === b
  return Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1
    && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1
}

/** The spotlight cutout: the target grown by `padding`, kept inside the viewport. */
export function spotlightRect(target: TourRect, viewport: TourSize, padding = TOUR_SPOTLIGHT_PADDING): TourRect {
  const x = Math.max(0, target.x - padding)
  const y = Math.max(0, target.y - padding)
  const right = Math.min(viewport.width, target.x + target.width + padding)
  const bottom = Math.min(viewport.height, target.y + target.height + padding)
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) }
}

/** The four dimmed rects around a cutout (top, bottom, left, right), covering the rest of the viewport. */
export function scrimRects(spot: TourRect, viewport: TourSize): TourRect[] {
  const bottomY = spot.y + spot.height
  return [
    { x: 0, y: 0, width: viewport.width, height: spot.y },
    { x: 0, y: bottomY, width: viewport.width, height: Math.max(0, viewport.height - bottomY) },
    { x: 0, y: spot.y, width: spot.x, height: spot.height },
    { x: spot.x + spot.width, y: spot.y, width: Math.max(0, viewport.width - spot.x - spot.width), height: spot.height },
  ]
}

export function tourCardWidth(viewportWidth: number, insets: TourInsets): number {
  return Math.max(0, Math.min(TOUR_CARD_MAX_WIDTH, viewportWidth - insets.left - insets.right - 2 * TOUR_EDGE_MARGIN))
}

function clamp(value: number, min: number, max: number): number {
  return max < min ? min : Math.min(max, Math.max(min, value))
}

/**
 * Card placement: below the spotlight when there's room (or more room than
 * above), otherwise above; a forced `placement` flips only if its side can't
 * fit the card and the other can. Horizontally centred on the target and
 * clamped to the screen; `arrowX` is where the arrow points, inside the card.
 */
export function placeTourCard(args: {
  spot: TourRect
  card: TourSize
  viewport: TourSize
  insets: TourInsets
  placement?: TourPlacement
}): TourCardPosition {
  const { spot, card, viewport, insets, placement = 'auto' } = args
  const need = card.height + TOUR_CARD_GAP + TOUR_EDGE_MARGIN
  const below = viewport.height - insets.bottom - (spot.y + spot.height)
  const above = spot.y - insets.top
  const fitsBelow = below >= need
  const fitsAbove = above >= need

  let side: 'top' | 'bottom'
  if (placement === 'bottom') side = !fitsBelow && fitsAbove ? 'top' : 'bottom'
  else if (placement === 'top') side = !fitsAbove && fitsBelow ? 'bottom' : 'top'
  else side = fitsBelow || below >= above ? 'bottom' : 'top'

  const rawY = side === 'bottom' ? spot.y + spot.height + TOUR_CARD_GAP : spot.y - TOUR_CARD_GAP - card.height
  const y = clamp(rawY, insets.top + TOUR_EDGE_MARGIN, viewport.height - insets.bottom - TOUR_EDGE_MARGIN - card.height)

  const centerX = spot.x + spot.width / 2
  const x = clamp(
    centerX - card.width / 2,
    insets.left + TOUR_EDGE_MARGIN,
    viewport.width - insets.right - TOUR_EDGE_MARGIN - card.width,
  )
  const arrowX = clamp(centerX - x, ARROW_CORNER_CLEARANCE, card.width - ARROW_CORNER_CLEARANCE)
  return { x, y, side, arrowX }
}
