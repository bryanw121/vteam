/**
 * A whole team typed or pasted at once on the new-match screen, instead of one
 * player per sheet. Pure and unit-tested.
 *
 * Accepted (one player per line, or several on a line separated by commas or semicolons):
 *   "1 4 7 9 12 15"      a line of only numbers: one player per number
 *   "7 Maya Chen"        number, then a name
 *   "#12 Ana L"          "#" is fine; "L", "(L)", "lib" or "libero" marks a libero
 *   "Kai 3"              the number can come after the name
 *   "C 9 Dana" / "9 Dana (C)"  "C" or "(C)" marks the captain
 * Blank lines are skipped. The first six non-liberos, in the order typed, start
 * on the court in serving order (position I first); everyone else goes to the bench.
 */
import type { RosterPlayer } from '../../types'

export type RosterTextIssue = { line: number; text: string; message: string }

export type ParsedRoster = {
  players: RosterPlayer[]
  /** Up to six non-liberos, in serving order (position I first). */
  court: RosterPlayer[]
  bench: RosterPlayer[]
  issues: RosterTextIssue[]
}

const NUMBER = /^#?(\d{1,2})$/
const LIBERO = /^\(?(l|lib|libero)\)?$/i
const CAPTAIN = /^\(?(c|capt|captain)\)?$/i
const NAME_MAX = 40
export const ROSTER_MAX = 18

function parseEntry(entry: string): RosterPlayer | string {
  const tokens = entry.split(/\s+/).filter(Boolean)
  let number: number | null = null
  let libero = false
  let captain = false
  const name: string[] = []
  for (const token of tokens) {
    const n = token.match(NUMBER)
    if (n && number == null) number = Number(n[1])
    else if (LIBERO.test(token)) libero = true
    else if (CAPTAIN.test(token)) captain = true
    else name.push(token)
  }
  if (number == null) return 'No jersey number (0–99).'
  const player: RosterPlayer = { number }
  const joined = name.join(' ').slice(0, NAME_MAX).trim()
  if (joined) player.name = joined
  if (libero) player.libero = true
  if (captain) player.captain = true
  return player
}

/** The entries on one line: a line of bare numbers is one player each; otherwise commas / semicolons split it. */
function lineEntries(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed) return []
  if (/^(#?\d{1,2}[\s,;]*)+$/.test(trimmed)) return trimmed.split(/[\s,;]+/).filter(Boolean)
  return trimmed.split(/[,;]/).map(s => s.trim()).filter(Boolean)
}

export function parseRosterText(text: string): ParsedRoster {
  const players: RosterPlayer[] = []
  const issues: RosterTextIssue[] = []
  const seen = new Set<number>()
  text.split(/\r?\n/).forEach((line, i) => {
    for (const entry of lineEntries(line)) {
      const parsed = parseEntry(entry)
      if (typeof parsed === 'string') { issues.push({ line: i + 1, text: entry, message: parsed }); continue }
      if (seen.has(parsed.number)) { issues.push({ line: i + 1, text: entry, message: `#${parsed.number} is already on this team.` }); continue }
      if (players.length >= ROSTER_MAX) { issues.push({ line: i + 1, text: entry, message: `A team has at most ${ROSTER_MAX} players.` }); continue }
      seen.add(parsed.number)
      players.push(parsed)
    }
  })
  // One captain: the first one marked.
  let captainSeen = false
  for (const p of players) {
    if (!p.captain) continue
    if (captainSeen) delete p.captain
    captainSeen = true
  }
  const court = players.filter(p => !p.libero).slice(0, 6)
  const bench = players.filter(p => !court.includes(p))
  return { players, court, bench, issues }
}

/** The text that reproduces a team (to edit a team already entered): court in serving order, then the bench. */
export function rosterToText(court: (RosterPlayer | null)[], bench: RosterPlayer[]): string {
  const line = (p: RosterPlayer) => [p.number, p.name, p.libero ? 'L' : null, p.captain ? 'C' : null].filter(x => x != null && x !== '').join(' ')
  return [...court.filter((p): p is RosterPlayer => p != null), ...bench].map(line).join('\n')
}
