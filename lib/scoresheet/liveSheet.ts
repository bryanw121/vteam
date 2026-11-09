import { SET_DY } from './officialLayout'
import type { MeasureText, OfficialSheetLayout, SetArea, SheetMarkDiff, SheetOp, SheetRegion } from '../../types/scoresheet'

/**
 * The live scoresheet on the scoring screen: which part of the form to show while a set is
 * played, and what changed between two layouts (a point adds marks; an undo erases them, a
 * redo puts them back). Pure, unit-tested; drawing is OfficialSheetView's job.
 */

/** The set block on the form: from the team names row down to the final-score row (copySteps' regions). */
const SET_TOP = 104.5
const SET_HEIGHT = 335 + 14.4 - SET_TOP
const SET_LEFT = 27.8
const SET_WIDTH = 570.7

/** Where set `index` (0-based) is written: sets 1–2 on the first copy of the form, 3–4 on the second… */
export function setArea(index: number): SetArea {
  const block = index % 2
  return { page: Math.floor(index / 2), region: { x: SET_LEFT, y: SET_TOP + block * SET_DY, w: SET_WIDTH, h: SET_HEIGHT } }
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** A mark's identity: kind, page, position and content. Two identical marks get #1, #2… (see `opKeys`). */
function baseKey(op: SheetOp): string {
  switch (op.kind) {
    case 'text': return `t|${op.page}|${r2(op.x)}|${r2(op.y)}|${op.size}|${op.align ?? ''}|${op.bold ? 1 : 0}|${op.maxWidth ?? ''}|${op.text}`
    case 'line': return `l|${op.page}|${r2(op.x1)}|${r2(op.y1)}|${r2(op.x2)}|${r2(op.y2)}|${op.width ?? ''}`
    case 'ellipse': return `e|${op.page}|${r2(op.cx)}|${r2(op.cy)}|${r2(op.rx)}|${r2(op.ry)}|${op.width ?? ''}`
    case 'cover': return `c|${op.page}|${r2(op.x)}|${r2(op.y)}|${r2(op.w)}|${r2(op.h)}`
  }
}

/**
 * A stable key per mark, the same for the same mark in the next layout: React keeps unchanged
 * marks as they are and draws only new ones, and the diff below says what came and went.
 */
export function opKeys(ops: readonly SheetOp[]): string[] {
  const seen = new Map<string, number>()
  return ops.map(op => {
    const k = baseKey(op)
    const n = (seen.get(k) ?? 0) + 1
    seen.set(k, n)
    return n === 1 ? k : `${k}#${n}`
  })
}

/** Room around a mark's box, so a tint or outline reads around thin strokes. */
const PAD = 1.5

/** The area a mark covers on the form (text: from its measured width and font size). */
export function opBox(op: SheetOp, measure: MeasureText): SheetRegion {
  switch (op.kind) {
    case 'text': {
      const width = Math.min(measure(op.text, op.size, op.bold), op.maxWidth ?? Infinity)
      const x = op.align === 'center' ? op.x - width / 2 : op.align === 'right' ? op.x - width : op.x
      return { x: x - PAD, y: op.y - op.size * 0.8 - PAD, w: width + PAD * 2, h: op.size + PAD * 2 }
    }
    case 'line': {
      const pad = PAD + (op.width ?? 0.9) / 2
      const x = Math.min(op.x1, op.x2), y = Math.min(op.y1, op.y2)
      return { x: x - pad, y: y - pad, w: Math.abs(op.x2 - op.x1) + pad * 2, h: Math.abs(op.y2 - op.y1) + pad * 2 }
    }
    case 'ellipse': return { x: op.cx - op.rx - PAD, y: op.cy - op.ry - PAD, w: (op.rx + PAD) * 2, h: (op.ry + PAD) * 2 }
    case 'cover': return { x: op.x, y: op.y, w: op.w, h: op.h }
  }
}

/** Joins boxes that touch or nearly touch, so a new score and its check show as one area. */
export function mergeBoxes(boxes: SheetRegion[], gap = 2): SheetRegion[] {
  const out = boxes.map(b => ({ ...b }))
  let merged = true
  while (merged) {
    merged = false
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j]
        if (a.x <= b.x + b.w + gap && b.x <= a.x + a.w + gap && a.y <= b.y + b.h + gap && b.y <= a.y + a.h + gap) {
          const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
          out[i] = { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
          out.splice(j, 1)
          merged = true
          break outer
        }
      }
    }
  }
  return out
}

const EMPTY: SheetMarkDiff = { added: [], removed: [] }

/**
 * The marks on `page` that `next` has and `prev` doesn't (added) and the other way round
 * (removed). A point adds its marks; an undo removes them; a redo adds them again; an edit to
 * a past rally can do both. Covers (white-outs of printed labels) aren't shown as changes.
 */
export function diffMarks(prev: OfficialSheetLayout | null, next: OfficialSheetLayout | null, page: number, measure: MeasureText): SheetMarkDiff {
  if (!prev || !next || prev === next) return EMPTY
  const keyed = (l: OfficialSheetLayout) => {
    const keys = opKeys(l.ops)
    return new Map(l.ops.map((op, i) => [keys[i], op] as const).filter(([, op]) => op.page === page && op.kind !== 'cover'))
  }
  const a = keyed(prev), b = keyed(next)
  const only = (x: Map<string, SheetOp>, y: Map<string, SheetOp>) => mergeBoxes([...x].filter(([k]) => !y.has(k)).map(([, op]) => opBox(op, measure)))
  return { added: only(b, a), removed: only(a, b) }
}

/** Middle of the running-score column, where most points are written. */
const RUNNING_SCORE_X = 313
/** Wider than this, a phone can't read the changed marks together: focus on one area. */
const FOLLOW_MAX_WIDTH = 320

/**
 * "Follow the pen" on a phone: the area to zoom to after a change. What was just written
 * (or, after an undo, just erased); when those areas sit too far apart to read together
 * (a running score and a service box on the far side), the one nearest the running score.
 * null when nothing changed, so the view stays where it was.
 */
export function followFocus(diff: SheetMarkDiff): SheetRegion[] | null {
  const regions = diff.added.length ? diff.added : diff.removed
  if (!regions.length) return null
  const x1 = Math.min(...regions.map(r => r.x)), x2 = Math.max(...regions.map(r => r.x + r.w))
  if (x2 - x1 <= FOLLOW_MAX_WIDTH) return regions
  const dist = (r: SheetRegion) => Math.abs(r.x + r.w / 2 - RUNNING_SCORE_X)
  return [regions.reduce((a, b) => (dist(b) < dist(a) ? b : a))]
}
