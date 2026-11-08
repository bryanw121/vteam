/**
 * Where everything goes on the official USA Volleyball two-set scoresheet
 * (assets/scoresheet/usav-2-set-scoresheet.pdf, form 150801_SS2up). Pure: turns a match into a
 * list of marks (`SheetOp`) that officialPdf.ts draws onto copies of the form.
 *
 * Any format fits: the form holds two sets, so a one-set match fills the Set 1 block, and
 * matches with more sets continue on more copies of the form (sheet 2 holds sets 3 and 4, and
 * so on). On the form the left team is A in the first block and B in the second.
 *
 * Coordinates were measured from the PDF (pdfplumber), in points on the landscape page from
 * the top left. Set 2's block sits exactly SET_DY below set 1's.
 */
import type { MatchDoc, MatchState, MeasureText, OfficialSheetLayout, PointMark, SetState, SheetOp, TeamSetState, TeamSide } from '../../types/scoresheet'
import { other } from './engine'
import { teamName } from './summary'

export const SHEET_WIDTH = 792
export const SHEET_HEIGHT = 612

/** Distance from set 1's block to set 2's. */
const SET_DY = 244.5
/** Left edges of the six lineup columns (I..VI), each COL_W wide; first the left team, then the right. */
const COLS: Record<'left' | 'right', number[]> = {
  left: [27.8, 68.4, 109.1, 149.6, 190.3, 230.9],
  right: [354.9, 395.5, 436.1, 476.7, 517.3, 557.9],
}
const COL_W = 40.6
/** Width of the box for the entering player's number, left of the score box. */
const SUB_NUM_W = 14.4
/** Score box colon, from the column's left edge. */
const SUB_COLON = 27.6
const SUB_ROWS = 8
const SUB_ROW_TOP = 158.9
const SUB_ROW_H = 14.4
const ORDER_ROW = { top: 144.5, bottom: 158.9 }
/** Centre of the printed Roman numerals (I–VI) above each starting player. */
const ROMAN_Y = 140
const SERVICE_ROW_TOPS = [274.1, 294.4, 314.7]
const SERVICE_ROW_H = 20.3
const SERVICE_ROUNDS = 6
/** "Substitutions 1 2 … 12" numbers: x ranges for the left team; the right team's are RIGHT_DX further. */
const SUB_COUNT_X: [number, number][] = [
  [89.5, 93.9], [100.4, 104.7], [111.2, 115.5], [122.0, 126.3], [132.8, 137.2], [143.7, 148.0],
  [154.5, 158.8], [165.3, 169.7], [176.2, 180.5], [187.0, 195.7], [202.2, 210.4], [216.9, 225.6],
]
const SUB_COUNT_Y = { top: 339.6, bottom: 347 }
const RIGHT_DX = 367.6
/** Running score: three columns (1–12, 13–24, 25–36) per team, twelve rows. */
const POINT_COLS: Record<'left' | 'right', number> = { left: 271.5, right: 313.2 }
const POINT_COL_W = 10.43
const POINT_ROW_TOP = 133
const POINT_ROW_H = 11.76
const POINTS_ON_FORM = 36
/** Time-out boxes ("Time Outs"), centre x per side, centre y of the two rows. */
const TIMEOUT_X: Record<'left' | 'right', number> = { left: 291.4, right: 333.3 }
const TIMEOUT_Y = [306.6, 326.3]
/** Centres of the two Libero# boxes per side. */
const LIBERO_BOXES: Record<'left' | 'right', number[]> = { left: [224.4, 242.4], right: [384.1, 402.1] }

type ServiceBox = { score: number | null; checked: boolean; final: boolean }

/**
 * What goes in each service-round box of one position: an X in box 1 for the receiving team's
 * server I, then one box per service turn. A turn opened by the set's last rally (the team
 * sided out to win) was never served, so its box gets the final score without a check; each
 * team's last exit score is circled once the set is over.
 */
export function serviceBoxes(t: TeamSetState, team: TeamSide, slot: number, set: SetState): (ServiceBox | 'x')[] {
  const out: (ServiceBox | 'x')[] = []
  if (slot === 0 && set.firstServe !== team) out.push('x')
  const finished = set.winner != null
  const last = lastTurn(t, team, set)
  t.turns[slot].forEach((turn, i) => {
    const isLast = last?.slot === slot && last.index === i
    const unserved = finished && isLast && set.winner === team && turn.points === 0 && set.serving === team
    out.push({ score: turn.endScore, checked: !unserved, final: finished && isLast && turn.endScore != null })
  })
  return out
}

/** The team's most recent service turn: turns go round the rotation from the first server. */
function lastTurn(t: TeamSetState, team: TeamSide, set: SetState): { slot: number; index: number } | null {
  const firstSlot = set.firstServe === team ? 0 : 1
  let best: { slot: number; index: number } | null = null
  let bestOrder = -1
  for (let slot = 0; slot < 6; slot++) {
    for (let index = 0; index < t.turns[slot].length; index++) {
      const order = index * 6 + ((slot - firstSlot + 6) % 6)
      if (order > bestOrder) { bestOrder = order; best = { slot, index } }
    }
  }
  return best
}

const INK_SIZE = 8

export type OfficialLayoutOptions = { measure: MeasureText }

type Ctx = { ops: SheetOp[]; page: number; measure: MeasureText }

const hhmm = (ms: number | null) => {
  if (ms == null) return null
  const d = new Date(ms)
  return [String(d.getHours()).padStart(2, '0'), String(d.getMinutes()).padStart(2, '0')] as const
}

const usDate = (iso?: string) => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso ?? ''
}

function text(c: Ctx, x: number, y: number, value: string | number | null | undefined, size = INK_SIZE, opts: { align?: 'left' | 'center' | 'right'; maxWidth?: number; bold?: boolean } = {}) {
  const s = value == null ? '' : String(value).trim()
  if (!s) return
  c.ops.push({ kind: 'text', page: c.page, x, y, text: s, size, ...opts })
}
const line = (c: Ctx, x1: number, y1: number, x2: number, y2: number, width = 0.9) => c.ops.push({ kind: 'line', page: c.page, x1, y1, x2, y2, width })
const ellipse = (c: Ctx, cx: number, cy: number, rx: number, ry = rx, width = 0.9) => c.ops.push({ kind: 'ellipse', page: c.page, cx, cy, rx, ry, width })
/** A triangle around (cx, cy), point up: how the form marks a libero's serve (S6.2). */
function triangle(c: Ctx, cx: number, cy: number, r: number, spread = 0.95, width = 0.8) {
  const top = { x: cx, y: cy - r }
  const left = { x: cx - r * spread, y: cy + r * 0.62 }
  const right = { x: cx + r * spread, y: cy + r * 0.62 }
  line(c, top.x, top.y, right.x, right.y, width)
  line(c, right.x, right.y, left.x, left.y, width)
  line(c, left.x, left.y, top.x, top.y, width)
}
const cross = (c: Ctx, cx: number, cy: number, r: number) => {
  line(c, cx - r, cy - r, cx + r, cy + r)
  line(c, cx - r, cy + r, cx + r, cy - r)
}
/** A small check mark through a service-round box number (top left of the mark at x, y). */
const tick = (c: Ctx, x: number, y: number) => {
  line(c, x - 1, y + 2.4, x + 0.7, y + 4.2, 0.7)
  line(c, x + 0.7, y + 4.2, x + 3.8, y - 0.6, 0.7)
}
/** "a : b" around a printed colon. */
function scorePair(c: Ctx, colonX: number, y: number, a: number, b: number, size = 7.5) {
  text(c, colonX - 2, y, a, size, { align: 'right' })
  text(c, colonX + 2, y, b, size, { align: 'left' })
}

// ─── Header and right-hand panel (every sheet) ───────────────────────────────

function header(c: Ctx, doc: MatchDoc, state: MatchState) {
  const { info } = doc.setup
  text(c, 288, 29.5, info.competition, INK_SIZE, { maxWidth: 306 })
  text(c, 243, 44, info.city, INK_SIZE, { maxWidth: 352 })
  const box = info.gender ? { men: 266.65, women: 318.45, coed: 368.85 }[info.gender] : null
  if (box != null) cross(c, box, 68.25, 3.4)
  text(c, 440, 72.5, info.matchNo, INK_SIZE, { maxWidth: 154 })
  text(c, 427, 87, info.division, INK_SIZE, { maxWidth: 167 })
  text(c, 302, 101.5, teamName(doc, 'A'), 9, { align: 'center', maxWidth: 180, bold: true })
  text(c, 502, 101.5, teamName(doc, 'B'), 9, { align: 'center', maxWidth: 180, bold: true })
  text(c, 688, 29, usDate(info.date), INK_SIZE, { maxWidth: 84 })
  text(c, 688, 42, info.court, INK_SIZE, { maxWidth: 84 })
  const start = hhmm(state.sets[0]?.startedAt ?? null)
  if (start) text(c, 688, 55, `${start[0]}:${start[1]}`)
  // Match winner and sets won–lost, once the match is decided.
  if (state.over && state.winner) {
    const w = state.winner
    text(c, 606, 82.5, teamName(doc, w), INK_SIZE, { maxWidth: 128, bold: true })
    text(c, 746, 82.5, state.setsWon[w], 9, { align: 'center' })
    text(c, 763.7, 82.5, state.setsWon[other(w)], 9, { align: 'center' })
  }
  text(c, 618, 240, info.firstReferee, INK_SIZE, { maxWidth: 152 })
  text(c, 620, 256, info.secondReferee, INK_SIZE, { maxWidth: 150 })
  text(c, 628, 272, info.scorer, INK_SIZE, { maxWidth: 142 })
}

/** The SET n RESULTS box for one set (block 0 or 1 on this sheet). */
function setResults(c: Ctx, doc: MatchDoc, set: SetState, block: number) {
  if (!set.winner) return
  const dy = block * 41.8
  const w = set.winner
  const l = other(w)
  text(c, 634, 107 + dy, teamName(doc, w), INK_SIZE, { maxWidth: 108 })
  text(c, 759.3, 107 + dy, set.teams[w].score, 9, { align: 'center', bold: true })
  text(c, 634, 123.5 + dy, teamName(doc, l), INK_SIZE, { maxWidth: 108 })
  text(c, 759.3, 123.5 + dy, set.teams[l].score, 9, { align: 'center', bold: true })
}

/** On sheet 2+, relabel "Set 1"/"Set 2" and "SET 1/2 RESULTS" with the real set numbers. */
function relabel(c: Ctx, setNumber: number, block: number) {
  const dy = block * SET_DY
  c.ops.push({ kind: 'cover', page: c.page, x: 591.8, y: 110.6 + dy, w: 5.6, h: 7.4 })
  text(c, 592.6, 117 + dy, setNumber, INK_SIZE, { bold: true })
  const ry = block * 41.7
  c.ops.push({ kind: 'cover', page: c.page, x: 674.6, y: 87.6 + ry, w: 4.6, h: 7.6 })
  text(c, 675.1, 94.4 + ry, setNumber, 8, { bold: true })
}

// ─── One set ──────────────────────────────────────────────────────────────────

/** Sides of the form a team is drawn on in this block: A left in block 0, B left in block 1. */
const sideOf = (team: TeamSide, block: number): 'left' | 'right' => ((team === 'A') === (block === 0) ? 'left' : 'right')

function setBlock(c: Ctx, doc: MatchDoc, set: SetState, block: number, overflow: string[]) {
  const dy = block * SET_DY
  const label = `Set ${set.index + 1}`
  for (const team of ['A', 'B'] as const) {
    const side = sideOf(team, block)
    const t = set.teams[team]
    const opp = set.teams[other(team)]
    const cols = COLS[side]
    const players = doc.setup.teams[team].players
    // Captain, team name, liberos, serve / receive.
    // Game captain's number in the CAPTAIN circle; an X when there is none (S3.9.1, S3.5.1).
    const captain = players.find(p => p.captain)
    const capX = side === 'left' ? 103 : 465.7
    if (captain) text(c, capX, 115 + dy, captain.number, captain.number > 9 ? 6.5 : 7.5, { align: 'center', bold: true })
    else cross(c, capX, 112.45 + dy, 3.2)
    text(c, side === 'left' ? 97 : 427, 131 + dy, teamName(doc, team), INK_SIZE, { maxWidth: side === 'left' ? 126 : 116, bold: true })
    // Two Libero# boxes; an empty one gets an X (S3.7.3).
    LIBERO_BOXES[side].forEach((bx, i) => {
      const n = t.liberos[i]
      if (n != null) text(c, bx, 131.6 + dy, n, 7, { align: 'center', bold: true })
      else cross(c, bx, 129.3 + dy, 2.6)
    })
    // X through the S of the team serving first and through the R of the team receiving (S3.3).
    cross(c, side === 'left' ? 267.55 : 358.65, (set.firstServe === team ? 122.25 : 129.25) + dy, 2.6)

    for (let slot = 0; slot < 6; slot++) {
      const x0 = cols[slot]
      // The first time a libero serves in the set: a triangle around that position's Roman numeral (S6.2.1).
      if (t.liberoServeSlot === slot) triangle(c, x0 + COL_W / 2, ROMAN_Y + dy, 6.6, 1.5)
      // Starting player.
      text(c, x0 + COL_W / 2, (ORDER_ROW.top + ORDER_ROW.bottom) / 2 + 3.6 + dy, t.lineup[slot], 10, { align: 'center', bold: true })
      // Substitutions into this slot: entering player and the score (this team : opponent).
      const subs = t.subs.filter(s => s.slot === slot)
      subs.slice(0, SUB_ROWS).forEach((s, row) => {
        const y = SUB_ROW_TOP + row * SUB_ROW_H + SUB_ROW_H / 2 + 2.7 + dy
        text(c, x0 + SUB_NUM_W / 2, y, s.in, 8, { align: 'center', bold: true })
        scorePair(c, x0 + SUB_COLON, y, s.score[0], s.score[1], 7)
        if (s.exceptional) line(c, x0 + 2, y + 1.6, x0 + SUB_NUM_W - 2, y + 1.6, 0.6)
      })
      if (subs.length > SUB_ROWS) {
        overflow.push(`${label}, ${teamName(doc, team)} position ${slot + 1}: more substitutions than fit — ${subs.slice(SUB_ROWS).map(s => `${s.in} in at ${s.score[0]}:${s.score[1]}`).join(', ')}.`)
      }
      // Service rounds (S3.3.2, S6.1, S17): the receiving team's server I starts with an X in box
      // 1. Each turn takes the next box: a check through the box number once the server has
      // served, the team's score when the serve was lost, and the final exit score circled.
      const boxes = serviceBoxes(t, team, slot, set)
      boxes.slice(0, SERVICE_ROUNDS).forEach((b, box) => {
        const bx = x0 + (box < 3 ? 0 : COL_W / 2)
        const by = SERVICE_ROW_TOPS[box % 3] + dy
        if (b === 'x') {
          cross(c, bx + COL_W / 4, by + SERVICE_ROW_H / 2 + 1, 4)
          return
        }
        if (b.checked) tick(c, x0 + (box < 3 ? 16 : 35.5), by + 1.3)
        if (b.score != null) {
          const cx = bx + COL_W / 4 + 1.5
          const cy = by + SERVICE_ROW_H - 5
          text(c, cx, cy, b.score, 8, { align: 'center' })
          if (b.final) ellipse(c, cx, cy - 2.8, 6, 5.2)
        }
      })
      const late = boxes.slice(SERVICE_ROUNDS).filter((b): b is ServiceBox => b !== 'x' && b.score != null)
      if (late.length) {
        overflow.push(`${label}, ${teamName(doc, team)} server ${slot + 1}: service rounds 7+ ended at ${late.map(b => b.score).join(', ')}.`)
      }
    }

    // Substitutions used: slash the numbers.
    const dx = side === 'left' ? 0 : RIGHT_DX
    SUB_COUNT_X.slice(0, Math.min(12, t.subs.length)).forEach(([a, b]) => {
      line(c, a - 1 + dx, SUB_COUNT_Y.bottom + dy, b + 1 + dx, SUB_COUNT_Y.top + dy)
    })
    if (t.subs.length > 12) overflow.push(`${label}, ${teamName(doc, team)}: ${t.subs.length} substitutions.`)

    // Time-outs.
    t.timeouts.slice(0, 2).forEach((to, i) => scorePair(c, TIMEOUT_X[side], TIMEOUT_Y[i] + dy, to.score[0], to.score[1], 8))
    if (t.timeouts.length > 2) {
      overflow.push(`${label}, ${teamName(doc, team)}: extra time-outs at ${t.timeouts.slice(2).map(to => `${to.score[0]}:${to.score[1]}`).join(', ')}.`)
    }

    runningScore(c, t.marks, t.score, set.winner != null, POINT_COLS[side], dy, t.liberoPoints)
    if (t.score > POINTS_ON_FORM) overflow.push(`${label}: ${teamName(doc, team)} scored ${t.score} (the form counts to ${POINTS_ON_FORM}); final ${t.score}–${opp.score}.`)
  }
  // Start and end time (24-hour, as the form asks).
  const start = hhmm(set.startedAt)
  const end = hhmm(set.endedAt)
  if (start) { text(c, 57.4, 131 + dy, start[0], INK_SIZE, { align: 'right' }); text(c, 61.6, 131 + dy, start[1]) }
  if (end) { text(c, 574.1, 131 + dy, end[0], INK_SIZE, { align: 'right' }); text(c, 578.3, 131 + dy, end[1]) }
}

/**
 * The running score, as the USAV scoring instructions mark it: every point slashed (S6.1.3),
 * penalty points slashed and circled (S1.6), the final point slashed but not circled (S17.4.1),
 * and the unused numbers closed with a "T-bar": a line under the last point, a line down the
 * rest of that column, and a line through each unused column (S17.4.2-3). A set that starts at
 * 4–4 gets the same T-bar over 1–4 (a line from the top of the column to a line under 4, S2.5).
 */
function runningScore(c: Ctx, marks: PointMark[], score: number, finished: boolean, colX: number, dy: number, liberoPoints: number[] = []) {
  const cell = (n: number) => {
    const col = Math.floor((n - 1) / 12)
    const row = (n - 1) % 12
    // The 1–12 column's numbers are right-aligned: nudge its marks onto them.
    const x = colX + col * POINT_COL_W + (col === 0 ? 1.2 : 0)
    const y = POINT_ROW_TOP + row * POINT_ROW_H + dy
    return { x, y, cx: x + POINT_COL_W / 2, cy: y + POINT_ROW_H / 2 }
  }
  const under = (n: number) => {
    const { x, y } = cell(n)
    line(c, x + 0.8, y + POINT_ROW_H, x + POINT_COL_W - 0.8, y + POINT_ROW_H, 0.9)
  }
  const bottom = POINT_ROW_TOP + 12 * POINT_ROW_H + dy - 0.8
  const startScore = marks.filter(m => m === 'start').length
  if (startScore > 0) {
    under(startScore)
    for (let col = 0; col * 12 < startScore; col++) {
      const last = Math.min(startScore, col * 12 + 12)
      const x = cell(col * 12 + 1).cx
      line(c, x, cell(col * 12 + 1).y + 0.8, x, cell(last).y + POINT_ROW_H, 0.9)
    }
  }
  for (let n = startScore + 1; n <= Math.min(marks.length, POINTS_ON_FORM); n++) {
    const { x, y, cx, cy } = cell(n)
    line(c, x + 1.8, y + POINT_ROW_H - 1.8, x + POINT_COL_W - 1.8, y + 1.8)
    if (marks[n - 1] === 'penalty') ellipse(c, cx, cy, 4.6, 4.6)
    // Scored on a libero's serve: a triangle around the point (S6.2.2a).
    if (liberoPoints.includes(n)) triangle(c, cx, cy + 0.6, 5.4)
  }
  if (!finished || score >= POINTS_ON_FORM) return
  // T-bar: a line under the last point, then down the rest of its column; full lines through
  // the columns after it.
  if (score > 0) under(score)
  const firstUnused = score + 1
  for (let col = Math.floor((firstUnused - 1) / 12); col < 3; col++) {
    const from = Math.max(firstUnused, col * 12 + 1)
    const top = from === firstUnused && score > 0 && (score % 12 !== 0 || from !== col * 12 + 1) ? cell(from).y : cell(from).y + 0.8
    line(c, cell(from).cx, top, cell(from).cx, bottom, 0.9)
  }
}

// ─── Sanctions and remarks ────────────────────────────────────────────────────

const SANCTION_ROWS = 5
const SANCTION_ROW_TOP = 340.6
const SANCTION_ROW_H = 20.17
/** W / P / E / D column centres. */
const SANCTION_COL: Record<string, number> = { W: 622.5, P: 642.7, E: 662.85, D: 683 }

function sanctions(c: Ctx, state: MatchState, overflow: string[]) {
  if (state.improperRequests.A) cross(c, 715.05, 313.45, 4.2)
  if (state.improperRequests.B) cross(c, 765.7, 313.45, 4.2)
  const rows = state.sanctions.filter(s => s.kind !== 'improper-request')
  rows.slice(0, SANCTION_ROWS).forEach((s, i) => {
    const y = SANCTION_ROW_TOP + i * SANCTION_ROW_H + 13.5
    // Delay sanctions are written "D" in the warning / penalty column; others name the person.
    const col = { 'delay-warning': 'W', 'delay-penalty': 'P', warning: 'W', penalty: 'P', expulsion: 'E', disqualification: 'D' }[s.kind as Exclude<typeof s.kind, 'improper-request'>]
    const who = s.kind.startsWith('delay') ? 'D' : s.who == null ? 'Tm' : String(s.who)
    text(c, SANCTION_COL[col], y, who, 9, { align: 'center', bold: true })
    text(c, 703.15, y, s.team, 9, { align: 'center' })
    text(c, 723.3, y, s.set + 1, 9, { align: 'center' })
    scorePair(c, 752.8, y, s.score[0], s.score[1], 8.5)
  })
  rows.slice(SANCTION_ROWS).forEach(s => {
    overflow.push(`Sanction (more than the form holds): ${s.kind.replace('-', ' ')} to ${s.who == null ? 'team' : s.who} of team ${s.team}, set ${s.set + 1} at ${s.score[0]}:${s.score[1]}.`)
  })
}

/** Baselines of the REMARKS lines on the form. */
const REMARK_LINES = [470.2, 485.5, 500.9, 516.2, 531.6, 546.9, 562.2, 577.6, 591.6]
const REMARK_X = 606
const REMARK_W = 165
const REMARK_SIZE = 6.5
/** A plain continuation page: lines from the top. */
const PLAIN_TOP = 60
const PLAIN_LINE = 13
const PLAIN_SIZE = 9
const PLAIN_W = SHEET_WIDTH - 2 * 48

/** Word-wrap one remark to a width (long words are broken). */
export function wrap(textIn: string, width: number, size: number, measure: MeasureText): string[] {
  const out: string[] = []
  let current = ''
  for (const word of textIn.split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word
    if (measure(next, size) <= width) { current = next; continue }
    if (current) out.push(current)
    let rest = word
    while (measure(rest, size) > width && rest.length > 1) {
      let cut = rest.length - 1
      while (cut > 1 && measure(rest.slice(0, cut), size) > width) cut--
      out.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    current = rest
  }
  if (current) out.push(current)
  return out
}

// ─── The whole sheet ──────────────────────────────────────────────────────────

/** Lay a match out on as many copies of the two-set form as its sets need. */
export function officialLayout(doc: MatchDoc, state: MatchState, { measure }: OfficialLayoutOptions): OfficialSheetLayout {
  const formPages = Math.max(1, Math.ceil(state.sets.length / 2))
  const pages: OfficialSheetLayout['pages'] = Array.from({ length: formPages }, () => 'form' as const)
  const ops: SheetOp[] = []
  const overflow: string[] = []
  const notes: string[][] = Array.from({ length: formPages }, () => [])

  for (let page = 0; page < formPages; page++) {
    const c: Ctx = { ops, page, measure }
    header(c, doc, state)
    for (let block = 0; block < 2; block++) {
      const set = state.sets[page * 2 + block]
      if (page > 0) relabel(c, page * 2 + block + 1, block)
      if (!set) {
        // A block this match never used (one-set match, or the last sheet's second block).
        if (state.over || state.timeExpired) {
          const dy = block * SET_DY
          line(c, 40, 340 + dy, 590, 150 + dy, 0.8)
          c.ops.push({ kind: 'cover', page, x: 284, y: 236 + dy, w: 64, h: 16 })
          text(c, 316, 248 + dy, 'Not played', 11, { align: 'center', bold: true })
        }
        continue
      }
      setBlock(c, doc, set, block, overflow)
      setResults(c, doc, set, block)
      if (set.startScore > 0) notes[page].push(`Set ${set.index + 1} started at ${set.startScore}–${set.startScore} (crossed-out points).`)
    }
    if (formPages > 1) {
      if (page < formPages - 1) {
        const first = page * 2 + 3
        notes[page].push(`Continued on sheet ${page + 2} (${state.sets.length > first ? `sets ${first}–${first + 1}` : `set ${first}`}).`)
      }
      if (page > 0) notes[page].unshift(`Sheet ${page + 1} of ${formPages}.`)
    }
  }
  sanctions({ ops, page: 0, measure }, state, overflow)
  if (state.over && !state.winner) notes[0].push(`Match split ${state.setsWon.A}–${state.setsWon.B}.`)

  // Remarks: each sheet's own notes, then (from sheet 1 on) the match's remarks and anything that
  // didn't fit in its box. What doesn't fit on the forms' lines goes on plain pages.
  let numbered = 0
  const number = (items: string[]) => items.map(r => `${++numbered}. ${r}`)
  let queue: string[] = []
  for (let page = 0; page < formPages; page++) {
    queue = page === 0 ? [...number(notes[0]), ...number([...state.remarks, ...overflow])] : [...number(notes[page]), ...queue]
    let row = 0
    while (queue.length && row < REMARK_LINES.length) {
      const lines = wrap(queue[0], REMARK_W, REMARK_SIZE, measure)
      const room = REMARK_LINES.length - row
      lines.slice(0, room).forEach(t => ops.push({ kind: 'text', page, x: REMARK_X, y: REMARK_LINES[row++], text: t, size: REMARK_SIZE }))
      if (lines.length > room) queue[0] = lines.slice(room).join(' ')
      else queue.shift()
    }
  }
  if (queue.length) {
    const lines = queue.flatMap(item => wrap(item, PLAIN_W, PLAIN_SIZE, measure))
    const perPage = Math.floor((SHEET_HEIGHT - PLAIN_TOP - 40) / PLAIN_LINE)
    for (let i = 0; i < lines.length; i += perPage) {
      const page = pages.length
      pages.push('plain')
      ops.push({ kind: 'text', page, x: 48, y: 40, text: `Remarks (continued) · ${teamName(doc, 'A')} vs ${teamName(doc, 'B')}`, size: 11, bold: true })
      lines.slice(i, i + perPage).forEach((t, j) => ops.push({ kind: 'text', page, x: 48, y: PLAIN_TOP + j * PLAIN_LINE, text: t, size: PLAIN_SIZE }))
    }
  }
  return { pages, ops }
}
