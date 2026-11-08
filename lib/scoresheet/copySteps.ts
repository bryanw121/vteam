/**
 * "Copy to paper": the finished match as a list of steps in the order the paper USA Volleyball
 * two-set scoresheet is laid out, each saying what to write, where, and how (slash, circle, line
 * off). Pure; the screen is app/(app)/scorekeeper/[id]/copy.tsx. Uses the same conventions as
 * the filled PDF (officialLayout.ts): the left team is A in a sheet's first block and B in the
 * second, and sets 3–4 go on sheet 2. Empty parts (no subs, no sanctions) are skipped.
 */
import type { CopySection, CopyStep, MatchDoc, MatchState, SetState, SheetRegion, TeamSide } from '../../types/scoresheet'
import { POSITION_LABELS, other } from './engine'
import { SANCTION_CODES } from './describe'
import { teamName } from './summary'
import { SET_DY, serviceBoxes } from './officialLayout'

/** Set 2's block is this far below set 1's on the form. */
const R = (x: number, y: number, w: number, h: number): SheetRegion => ({ x, y, w, h })
const LEFT = { x: 27.8, w: 243.7 }
const RIGHT = { x: 354.9, w: 243.6 }

const hhmm = (ms: number | null) => {
  if (ms == null) return '—'
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const usDate = (iso?: string) => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso || '—'
}
const or = (v: string | undefined | null) => (v && v.trim() ? v.trim() : '—')

const leftTeam = (block: number): TeamSide => (block === 0 ? 'A' : 'B')

/**
 * How to mark one team's POINTS column, the USAV way: a T-bar over the points a set started
 * from, every point slashed, penalty points also circled, and a T-bar to close the rest once
 * the set is over (the final point is not circled).
 */
export function pointsInstruction(score: number, startScore: number, finished: boolean, penalties: number[] = [], liberoPoints: number[] = []): string {
  const parts: string[] = []
  if (startScore > 0) parts.push(`T-bar over 1–${startScore}: a line down from the top and a line under ${startScore}`)
  const from = startScore + 1
  if (score >= from) parts.push(from === score ? `slash ${score}` : `slash ${from}–${score}`)
  if (penalties.length) parts.push(`circle ${penalties.join(', ')} (penalty point${penalties.length > 1 ? 's' : ''})`)
  if (liberoPoints.length) parts.push(`draw a triangle around ${liberoPoints.join(', ')} (scored on the libero's serve)`)
  if (finished && score < 36) parts.push(score > 0 ? `then a line under ${score} and down through ${score + 1}–36` : 'then a line down through every column')
  const text = parts.join(', ') || 'Nothing to mark yet'
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** One position's service-round boxes as text: "X", "✓13", final scores in brackets (circle them). */
export function serviceText(boxes: ReturnType<typeof serviceBoxes>): string {
  return boxes.map(b => (b === 'x' ? 'X' : `${b.checked ? '✓' : ''}${b.score == null ? '' : b.final ? `(${b.score})` : b.score}`)).filter(Boolean).join(' · ') || '—'
}

function header(doc: MatchDoc, state: MatchState): CopyStep {
  const { info } = doc.setup
  const gender = info.gender ? { men: 'Men', women: 'Women', coed: 'CoEd' }[info.gender] : '—'
  return {
    id: 'header',
    title: 'Header & teams',
    where: 'Top of the sheet, and the date / court / time box at the top right',
    sheet: 1,
    regions: [R(206, 18, 392, 86), R(665, 18, 109, 39)],
    sections: [
      { kind: 'rows', rows: [
        { label: 'Team A (left of "vs")', value: teamName(doc, 'A') },
        { label: 'Team B (right of "vs")', value: teamName(doc, 'B') },
      ] },
      { kind: 'rows', rows: [
        { label: 'Date', value: usDate(info.date) },
        { label: 'Time (24-hour)', value: hhmm(state.sets[0]?.startedAt ?? null) },
        { label: 'Court', value: or(info.court) },
      ] },
      { kind: 'rows', rows: [
        { label: 'Competition', value: or(info.competition) },
        { label: 'City, state', value: or(info.city) },
        { label: 'Division (tick)', value: gender },
        { label: 'Match no.', value: or(info.matchNo) },
        { label: 'Level', value: or(info.division) },
      ] },
    ],
  }
}

function setSteps(doc: MatchDoc, state: MatchState, set: SetState): CopyStep[] {
  const sheet = Math.floor(set.index / 2) + 1
  const block = set.index % 2
  const dy = block * SET_DY
  const L = leftTeam(block)
  const Rt = other(L)
  const n = set.index + 1
  const name = (t: TeamSide) => teamName(doc, t)
  const where = (part: string) => `${part}, Set ${n} block (${block === 0 ? 'top' : 'bottom'} half${sheet > 1 ? `, sheet ${sheet}` : ''})`
  const captain = (t: TeamSide) => doc.setup.teams[t].players.find(p => p.captain)?.number
  const steps: CopyStep[] = []

  steps.push({
    id: `set${n}-teams`,
    title: `Set ${n} · Teams & serve`,
    where: where('The two rows above the I–VI headings'),
    sheet,
    regions: [R(27.8, 104.5 + dy, 570.7, 28.5)],
    sections: [
      ...([L, Rt] as const).map((t): CopySection => ({
        kind: 'rows',
        title: `${t === L ? 'Left' : 'Right'} · ${name(t)} (${t})`,
        rows: [
          { label: 'Team', value: name(t) },
          { label: 'Serve', value: set.firstServe === t ? 'X through the S' : 'X through the R' },
          { label: 'CAPTAIN circle', value: captain(t) != null ? `${captain(t)}` : 'X (no captain)' },
          { label: 'Libero# boxes', value: [0, 1].map(i => set.teams[t].liberos[i] ?? 'X').join(' and ') },
        ],
      })),
      { kind: 'rows', rows: [{ label: 'Start time (left box)', value: hhmm(set.startedAt) }] },
    ],
  })

  steps.push({
    id: `set${n}-lineup`,
    title: `Set ${n} · Starting lineup`,
    where: where('The "Order" row under I–VI'),
    sheet,
    regions: [R(LEFT.x, 144.5 + dy, LEFT.w, 14.4), R(RIGHT.x, 144.5 + dy, RIGHT.w, 14.4)],
    sections: [
      ...([L, Rt] as const).map(t => ({
        kind: 'grid' as const,
        title: `${t === L ? 'Left' : 'Right'} · ${name(t)}`,
        // △ on the position the libero served for: triangle its Roman numeral (S6.2.1).
        cells: POSITION_LABELS.map((label, slot) => ({ label: set.teams[t].liberoServeSlot === slot ? `${label} △` : label, value: String(set.teams[t].lineup[slot]) })),
      })),
      ...([L, Rt] as const).flatMap(t => {
        const slot = set.teams[t].liberoServeSlot
        return slot == null ? [] : [{ kind: 'rows' as const, title: '', rows: [{ label: `${name(t)}'s libero served`, value: `Triangle around ${POSITION_LABELS[slot]}` }] }]
      }),
    ],
  })

  const subs = ([L, Rt] as const).filter(t => set.teams[t].subs.length > 0)
  if (subs.length) {
    steps.push({
      id: `set${n}-subs`,
      title: `Set ${n} · Substitutions`,
      where: where('Under each position: the player coming in (small box) and the score'),
      sheet,
      regions: subs.map(t => (t === L ? R(LEFT.x, 158.9 + dy, LEFT.w, 115.2) : R(RIGHT.x, 158.9 + dy, RIGHT.w, 115.2))),
      sections: subs.map(t => ({
        kind: 'rows',
        title: `${t === L ? 'Left' : 'Right'} · ${name(t)}`,
        rows: set.teams[t].subs.map(s => ({ label: `Under ${POSITION_LABELS[s.slot]}`, value: `#${s.in} in · ${s.score[0]} : ${s.score[1]}${s.exceptional ? ' (exceptional)' : ''}` })),
      })),
    })
  }

  const finished = set.winner != null
  steps.push({
    id: `set${n}-points`,
    title: `Set ${n} · Running score`,
    where: where('The "Points" columns in the middle, and "Time Outs" under them'),
    sheet,
    regions: [R(271.5, 133 + dy, 83.4, 202)],
    sections: [
      ...([L, Rt] as const).map(t => ({
        kind: 'big' as const,
        title: `${t === L ? 'Left' : 'Right'} column · ${name(t)}`,
        value: String(set.teams[t].score),
        detail: pointsInstruction(set.teams[t].score, set.startScore, finished, set.teams[t].marks.flatMap((m, i) => (m === 'penalty' ? [i + 1] : [])), set.teams[t].liberoPoints),
      })),
      {
        kind: 'rows',
        title: 'Time-outs (team : opponent)',
        rows: ([L, Rt] as const).flatMap(t => set.teams[t].timeouts.map((to, i) => ({ label: `${name(t)} · ${i + 1}`, value: `${to.score[0]} : ${to.score[1]}` }))),
        empty: 'No time-outs',
      },
    ],
  })

  steps.push({
    id: `set${n}-service`,
    title: `Set ${n} · Service rounds`,
    where: where('"Service Rounds": the score when each server lost the serve (boxes 1–6 under each position)'),
    sheet,
    regions: [R(LEFT.x, 274.1 + dy, LEFT.w, 60.9), R(RIGHT.x, 274.1 + dy, RIGHT.w, 60.9)],
    sections: [
      ...([L, Rt] as const).map((t): CopySection => ({
        kind: 'grid',
        title: `${t === L ? 'Left' : 'Right'} · ${name(t)}`,
        cells: POSITION_LABELS.map((label, slot) => ({
          label,
          value: serviceText(serviceBoxes(set.teams[t], t, slot, set)),
        })),
      })),
      { kind: 'rows', title: 'How to read it', rows: [
        { label: 'Order', value: 'Boxes 1, 2, 3 down the left, then 4, 5, 6' },
        { label: '✓', value: 'Check the small box number' },
        { label: '( )', value: 'Circle it: the final score' },
        { label: 'X', value: 'An X in box 1 (team received first)' },
      ] },
    ],
  })

  steps.push({
    id: `set${n}-end`,
    title: `Set ${n} · Close the set`,
    where: where('"Substitutions 1–12" along the bottom, and the End time at the top right'),
    sheet,
    regions: [R(27.8, 335 + dy, 570.7, 14.4), R(544, 118.6 + dy, 54.5, 14.4)],
    sections: [{
      kind: 'rows',
      rows: [
        ...([L, Rt] as const).map(t => ({ label: `${name(t)} substitutions`, value: set.teams[t].subs.length ? `Slash 1–${Math.min(12, set.teams[t].subs.length)}` : 'None' })),
        { label: 'End time', value: hhmm(set.endedAt) },
      ],
    }],
  })
  return steps
}

/** All the steps for a match, in paper order. */
export function copySteps(doc: MatchDoc, state: MatchState): CopyStep[] {
  const steps: CopyStep[] = [header(doc, state), ...state.sets.flatMap(set => setSteps(doc, state, set))]
  const sheets = Math.max(1, Math.ceil(state.sets.length / 2))
  const name = (t: TeamSide) => teamName(doc, t)

  // Results (on every sheet, for that sheet's sets) and the match winner.
  const resultRows = state.sets.filter(s => s.winner).map(s => ({
    label: `Set ${s.index + 1}${s.index >= 2 ? ` (sheet ${Math.floor(s.index / 2) + 1})` : ''}`,
    value: `Winning ${name(s.winner!)} ${s.teams[s.winner!].score} · Losing ${name(other(s.winner!))} ${s.teams[other(s.winner!)].score}`,
  }))
  const unplayed = state.over && state.sets.length % 2 === 1
  steps.push({
    id: 'results',
    title: 'Results',
    where: 'Right column, top: MATCH WINNER and SET RESULTS',
    sheet: 1,
    regions: [R(603, 59.9, 170.7, 109.4)],
    sections: [
      { kind: 'rows', title: 'Set results', rows: resultRows, empty: 'No set finished yet' },
      { kind: 'rows', title: 'Match winner', rows: state.over && state.winner
        ? [{ label: 'Team', value: name(state.winner) }, { label: 'Sets W : L', value: `${state.setsWon[state.winner]} : ${state.setsWon[other(state.winner)]}` }]
        : [{ label: 'Team', value: state.over ? `Split ${state.setsWon.A}–${state.setsWon.B}: leave blank` : 'Match not finished' }] },
      ...(unplayed ? [{ kind: 'rows' as const, rows: [{ label: `Set ${state.sets.length + 1} block`, value: 'Not played: draw a line through it' }] }] : []),
    ],
  })

  const sanctions = state.sanctions.filter(s => s.kind !== 'improper-request')
  if (sanctions.length || state.improperRequests.A || state.improperRequests.B) {
    steps.push({
      id: 'sanctions',
      title: 'Sanctions',
      where: 'Right column: the SANCTIONS table and IMPROPER REQUEST',
      sheet: 1,
      regions: [R(603, 295, 170.7, 146.4)],
      sections: [
        { kind: 'rows', title: 'One row each', rows: sanctions.map(s => {
          const col = { 'delay-warning': 'W', 'delay-penalty': 'P', warning: 'W', penalty: 'P', expulsion: 'E', disqualification: 'D', 'improper-request': '' }[s.kind]
          const who = s.kind.startsWith('delay') ? 'D' : s.who == null ? 'team' : String(s.who)
          return { label: `${SANCTION_CODES[s.kind]} · team ${s.team}`, value: `"${who}" under ${col} · set ${s.set + 1} · ${s.score[0]} : ${s.score[1]}` }
        }), empty: 'None' },
        ...(state.improperRequests.A || state.improperRequests.B
          ? [{ kind: 'rows' as const, rows: (['A', 'B'] as const).filter(t => state.improperRequests[t]).map(t => ({ label: 'Improper request', value: `Cross out team ${t}` })) }]
          : []),
      ],
    })
  }

  const remarks = [
    ...state.sets.filter(s => s.startScore > 0).map(s => `Set ${s.index + 1} started at ${s.startScore}–${s.startScore}.`),
    ...(sheets > 1 ? [`Continued on sheet 2 (set${state.sets.length > 3 ? 's 3–4' : ' 3'}).`] : []),
    ...state.remarks,
  ]
  if (remarks.length) {
    steps.push({
      id: 'remarks',
      title: 'Remarks',
      where: 'Right column, bottom: REMARKS',
      sheet: 1,
      regions: [R(603, 448, 170.7, 150)],
      sections: [{ kind: 'rows', rows: remarks.map((r, i) => ({ label: `${i + 1}.`, value: r })) }],
    })
  }

  const { info } = doc.setup
  steps.push({
    id: 'officials',
    title: 'Officials & signing',
    where: 'Right column: OFFICIALS PRINTED NAMES, then SIGNATURES',
    sheet: 1,
    regions: [R(603, 218.8, 170.7, 73.5), R(603, 172.8, 170.7, 42.1)],
    sections: [
      { kind: 'rows', title: 'Printed names', rows: [
        { label: '1st referee', value: or(info.firstReferee) },
        { label: '2nd referee', value: or(info.secondReferee) },
        { label: 'Scorer', value: or(info.scorer) },
      ] },
      { kind: 'rows', title: 'Then sign', rows: [{ label: 'Signatures', value: 'Scorer, then the 1st referee' }] },
    ],
  })
  return steps
}

/** Index of the first step not ticked yet (or the last step when all are). */
export function resumeIndex(steps: CopyStep[], copied: readonly string[] = []): number {
  const i = steps.findIndex(s => !copied.includes(s.id))
  return i === -1 ? Math.max(0, steps.length - 1) : i
}
