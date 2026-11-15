/**
 * The new-match screen's number grid (every jersey number of both teams on one screen),
 * as plain data. Pure and unit-tested: the screen only renders boxes and moves focus.
 */
import type { GridBox, NumberGridIssues, NumberGridTeam, RosterPlayer } from '../../types'

/** Bench boxes shown at first; one more appears whenever the last is filled, up to BENCH_MAX. */
export const BENCH_START = 4
export const BENCH_MAX = 12
export const LIBERO_BOXES = 2

const blanks = (n: number) => Array.from({ length: n }, () => '')

export function emptyGrid(): NumberGridTeam {
  return { name: '', court: blanks(6), bench: blanks(BENCH_START), liberos: blanks(LIBERO_BOXES), details: {} }
}

/** A box's text: digits only, at most two (jersey numbers are 0–99). */
export function cleanBox(text: string): string {
  return text.replace(/\D/g, '').slice(0, 2)
}

/** The numbers in a pasted or typed string ("7 12, 3"), in order. */
export function numbersIn(text: string): string[] {
  return (text.match(/\d{1,2}/g) ?? [])
}

export function boxNumber(box: string): number | null {
  return /^\d{1,2}$/.test(box) ? Number(box) : null
}

/** Bench boxes with one empty box at the end (while there's room), never fewer than BENCH_START. */
export function withBenchRoom(bench: string[]): string[] {
  const filled = bench.filter(b => b !== '')
  const size = Math.min(BENCH_MAX, Math.max(BENCH_START, filled.length + 1))
  return [...filled, ...blanks(size - filled.length)]
}

/** A grid from a saved team or a pasted roster: the court in order, liberos into their boxes, everyone else on the bench. */
export function gridFromRoster(name: string, court: (RosterPlayer | null)[], bench: RosterPlayer[]): NumberGridTeam {
  const details: NumberGridTeam['details'] = {}
  const note = (p: RosterPlayer) => {
    if (p.name || p.captain) details[p.number] = { ...(p.name ? { name: p.name } : {}), ...(p.captain ? { captain: true } : {}) }
  }
  const courtBoxes = blanks(6)
  court.slice(0, 6).forEach((p, i) => { if (p) { courtBoxes[i] = String(p.number); note(p) } })
  const liberos = bench.filter(p => p.libero).slice(0, LIBERO_BOXES)
  const rest = bench.filter(p => !liberos.includes(p))
  rest.forEach(note)
  liberos.forEach(note)
  const liberoBoxes = blanks(LIBERO_BOXES)
  liberos.forEach((p, i) => { liberoBoxes[i] = String(p.number) })
  return { name, court: courtBoxes, bench: withBenchRoom(rest.map(p => String(p.number))), liberos: liberoBoxes, details }
}

export function gridIsEmpty(team: NumberGridTeam): boolean {
  return !team.name.trim() && [...team.court, ...team.bench, ...team.liberos].every(b => b === '')
}

export function gridIssues(team: NumberGridTeam): NumberGridIssues {
  const seen = new Set<number>()
  const duplicates = new Set<number>()
  for (const box of [...team.court, ...team.bench, ...team.liberos]) {
    const n = boxNumber(box)
    if (n == null) continue
    if (seen.has(n)) duplicates.add(n)
    seen.add(n)
  }
  return { missingCourt: team.court.filter(b => boxNumber(b) == null).length, duplicates: [...duplicates].sort((a, b) => a - b) }
}

export function gridReady(team: NumberGridTeam): boolean {
  const issues = gridIssues(team)
  return issues.missingCourt === 0 && issues.duplicates.length === 0
}

/** The team as roster players: the starting six in serving order, then the bench (liberos marked). Repeats are dropped. */
export function gridToRoster(team: NumberGridTeam): { court: RosterPlayer[]; bench: RosterPlayer[] } {
  const used = new Set<number>()
  const player = (box: string, libero = false): RosterPlayer | null => {
    const n = boxNumber(box)
    if (n == null || used.has(n)) return null
    used.add(n)
    const d = team.details[n]
    return { number: n, ...(d?.name ? { name: d.name } : {}), ...(d?.captain ? { captain: true } : {}), ...(libero ? { libero: true } : {}) }
  }
  const court = team.court.map(b => player(b)).filter((p): p is RosterPlayer => p != null)
  const liberos = team.liberos.map(b => player(b, true)).filter((p): p is RosterPlayer => p != null)
  const bench = team.bench.map(b => player(b)).filter((p): p is RosterPlayer => p != null)
  return { court, bench: [...bench, ...liberos] }
}

export function gridBoxes(team: NumberGridTeam): GridBox[] {
  return [
    ...team.court.map((_, index) => ({ part: 'court' as const, index })),
    ...team.bench.map((_, index) => ({ part: 'bench' as const, index })),
    ...team.liberos.map((_, index) => ({ part: 'liberos' as const, index })),
  ]
}

/**
 * Type into one box. A single number fills that box; several numbers (a paste, or "7 12")
 * fill it and the boxes after it in the same part, so a lineup can be pasted into position I.
 * Returns the new team and how many boxes were filled.
 */
export function typeIntoBox(team: NumberGridTeam, box: GridBox, text: string): { team: NumberGridTeam; filled: number } {
  const numbers = numbersIn(text)
  const part = [...team[box.part]]
  if (numbers.length <= 1) {
    part[box.index] = cleanBox(text)
    const next = { ...team, [box.part]: part }
    return { team: box.part === 'bench' ? { ...next, bench: withBenchRoomKeepingPlace(part) } : next, filled: part[box.index] ? 1 : 0 }
  }
  let i = box.index
  let filled = 0
  for (const n of numbers) {
    if (box.part === 'bench' && i >= part.length && part.length < BENCH_MAX) part.push('')
    if (i >= part.length) break
    part[i++] = n
    filled++
  }
  const next = { ...team, [box.part]: part }
  return { team: box.part === 'bench' ? { ...next, bench: withBenchRoomKeepingPlace(part) } : next, filled }
}

/** Like withBenchRoom, but keeps boxes where they are while typing (an emptied box doesn't jump). */
function withBenchRoomKeepingPlace(bench: string[]): string[] {
  const out = [...bench]
  if (out[out.length - 1] !== '' && out.length < BENCH_MAX) out.push('')
  return out
}

/** Team label on the next step and the scoresheet: the typed name, else "Team A". */
export function gridTeamLabel(team: NumberGridTeam, side: 'A' | 'B'): string {
  return team.name.trim() || `Team ${side}`
}
