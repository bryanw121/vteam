import type { MatchDoc, MatchState, MatchSummary, TeamSide } from '../../types/scoresheet'

export const teamName = (doc: Pick<MatchDoc, 'setup'>, side: TeamSide) => doc.setup.teams[side].name.trim() || `Team ${side}`

export function matchTitle(doc: Pick<MatchDoc, 'setup'>): string {
  return `${teamName(doc, 'A')} vs ${teamName(doc, 'B')}`
}

/** "2–1 · 25–20, 18–25, 15–12", or the live set's score. */
export function scoreLine(state: MatchState): string {
  const sets = state.sets.map(s => `${s.teams.A.score}–${s.teams.B.score}`)
  if (!sets.length) return 'Not started'
  if (state.current != null && !state.over) return `Set ${state.current + 1}: ${sets.at(-1)}${sets.length > 1 ? ` (sets ${state.setsWon.A}–${state.setsWon.B})` : ''}`
  return `${state.setsWon.A}–${state.setsWon.B} · ${sets.join(', ')}`
}

export function matchSummary(doc: MatchDoc, state: MatchState): MatchSummary {
  return { id: doc.id, title: matchTitle(doc), updatedAt: doc.updatedAt, status: state.over ? 'final' : 'live', score: scoreLine(state) }
}

/** Plain-text result for sharing. */
export function shareText(doc: MatchDoc, state: MatchState): string {
  const lines = [matchTitle(doc)]
  const { info } = doc.setup
  const where = [info.competition, info.division, info.court && `Court ${info.court}`, info.date].filter(Boolean).join(' · ')
  if (where) lines.push(where)
  state.sets.forEach((s, i) => lines.push(`Set ${i + 1}: ${teamName(doc, 'A')} ${s.teams.A.score} – ${s.teams.B.score} ${teamName(doc, 'B')}`))
  if (state.over) lines.push(state.winner ? `Winner: ${teamName(doc, state.winner)} (${state.setsWon.A}–${state.setsWon.B})` : `Split ${state.setsWon.A}–${state.setsWon.B}`)
  lines.push('Scored with vteam')
  return lines.join('\n')
}
