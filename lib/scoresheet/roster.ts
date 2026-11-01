import type { RosterPlayer } from '../../types/scoresheet'

export type RosterParse = { players: RosterPlayer[]; errors: string[] }

/**
 * Reads a roster typed one player per line: "7 Jane Doe", "#12 Kim L" (libero), "3 Ana C"
 * (captain), or just "15". Commas also separate players.
 */
export function parseRoster(text: string): RosterParse {
  const players: RosterPlayer[] = []
  const errors: string[] = []
  const lines = text.split(/[\n,]+/).map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    const m = /^#?\s*(\d{1,2})\b\s*(.*)$/.exec(line)
    if (!m) {
      errors.push(`"${line}" needs a jersey number first, like "7 ${line}".`)
      continue
    }
    const number = Number(m[1])
    let rest = m[2].trim()
    let libero = false
    let captain = false
    // Trailing markers: L / (L) / libero, C / (C) / captain, in any order.
    for (;;) {
      const mark = /(?:^|\s)\(?(l|libero|c|capt|captain)\)?$/i.exec(rest)
      if (!mark) break
      const word = mark[1].toLowerCase()
      if (word.startsWith('l')) libero = true
      else captain = true
      rest = rest.slice(0, mark.index).trim()
    }
    if (players.some(p => p.number === number)) {
      errors.push(`#${number} is listed twice.`)
      continue
    }
    players.push({ number, ...(rest ? { name: rest } : {}), ...(libero ? { libero } : {}), ...(captain ? { captain } : {}) })
  }
  return { players: players.sort((a, b) => a.number - b.number), errors }
}

export function rosterToText(players: readonly RosterPlayer[]): string {
  return players.map(p => [p.number, p.name, p.libero ? 'L' : '', p.captain ? 'C' : ''].filter(Boolean).join(' ')).join('\n')
}
