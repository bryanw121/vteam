import type {
  BracketPlan, Podium, SetScore, SetScoreDraft, TiebreakerKey, Tournament, TournamentMatchRow, TournamentPoolWithTeams,
  TournamentResultWrites, TournamentStatus,
} from '../types'
import {
  advanceFrom, bracketComplete, bracketPodium, keyedRows, planFromRows, rowKey, slotColumn,
} from './tournamentBracket'
import { computeStandings, DEFAULT_TIEBREAKERS, standingsPodium } from './tournamentStandings'

/**
 * Pure glue between stored tournament rows and the engine: what recording a
 * result has to write, who won from set scores, the podium, pool tables. No I/O.
 */

const done = (m: Pick<TournamentMatchRow, 'status' | 'winner_id'>) => !!m.winner_id && (m.status === 'completed' || m.status === 'forfeit')

export const usesBracket = (format: Tournament['format']) => format === 'bracket' || format === 'pool_bracket'

/** Parse the result sheet's set rows. Blank rows are skipped; a row with one blank side or a tie is an error. */
export function parseSets(drafts: readonly SetScoreDraft[]): { sets: SetScore[]; error: string | null } {
  const sets: SetScore[] = []
  for (const [i, d] of drafts.entries()) {
    const a = d.a.trim()
    const b = d.b.trim()
    if (!a && !b) continue
    if (!/^\d{1,3}$/.test(a) || !/^\d{1,3}$/.test(b)) return { sets: [], error: `Set ${i + 1}: enter both scores as whole numbers.` }
    if (Number(a) === Number(b)) return { sets: [], error: `Set ${i + 1} can't end in a tie.` }
    sets.push({ set_number: sets.length + 1, team_a_score: Number(a), team_b_score: Number(b) })
  }
  return { sets, error: null }
}

/** 'a' / 'b' when one side won more sets, else null. */
export function winnerFromSets(sets: readonly SetScore[]): 'a' | 'b' | null {
  const a = sets.filter(s => s.team_a_score > s.team_b_score).length
  const b = sets.filter(s => s.team_b_score > s.team_a_score).length
  return a > b ? 'a' : b > a ? 'b' : null
}

function bracketRows(matches: readonly TournamentMatchRow[]) {
  return matches.filter(m => m.stage === 'bracket')
}

export function bracketPlanFor(matches: readonly TournamentMatchRow[], tournament: Pick<Tournament, 'bracket_type'>): BracketPlan | null {
  return planFromRows(bracketRows(matches), tournament.bracket_type ?? 'single')
}

/** Every match that decides the result is in: the bracket's final (+ third place), or every match for round robins. */
export function isTournamentDecided(matches: readonly TournamentMatchRow[], tournament: Pick<Tournament, 'format' | 'bracket_type'>): boolean {
  if (usesBracket(tournament.format)) {
    const plan = bracketPlanFor(matches, tournament)
    return !!plan && bracketComplete(plan, keyedRows(bracketRows(matches), plan))
  }
  return matches.length > 0 && matches.every(done)
}

/**
 * The writes recording `winnerId` for `match` causes: bracket slots the winner
 * (and loser) move into, and the tournament status change (in progress on the
 * first result, completed once the deciding matches are all in). `blocked` is
 * set when a later match the result feeds has already been played with a
 * different team, since changing it would rewrite history.
 */
export function resultWrites(args: {
  match: TournamentMatchRow
  winnerId: string
  matches: readonly TournamentMatchRow[]
  tournament: Pick<Tournament, 'format' | 'bracket_type' | 'status'>
  /** Registered teams (round-robin podiums rank these). */
  teamIds?: readonly string[]
  tiebreakers?: readonly TiebreakerKey[]
}): TournamentResultWrites {
  const { match, winnerId, matches, tournament } = args
  if (winnerId !== match.team_a_id && winnerId !== match.team_b_id) {
    return { advances: [], nextStatus: null, podium: null, blocked: 'Pick one of the two teams as the winner.' }
  }
  const loserId = winnerId === match.team_a_id ? match.team_b_id : match.team_a_id
  const advances: TournamentResultWrites['advances'] = []

  if (match.stage === 'bracket') {
    const plan = bracketPlanFor(matches, tournament)
    if (plan) {
      const rows = bracketRows(matches)
      const byKey = keyedRows(rows, plan)
      for (const adv of advanceFrom(plan, new Set(byKey.keys()), rowKey(match, plan), winnerId, loserId)) {
        const target = byKey.get(adv.key)
        if (!target) continue
        const column = slotColumn(adv.slot)
        if (done(target) && target[column] !== adv.teamId) {
          return { advances: [], nextStatus: null, podium: null, blocked: `${target.bracket_round_name ?? 'The next match'} has already been played. Change that result first.` }
        }
        advances.push({ matchId: target.id, column, teamId: adv.teamId })
      }
    }
  }

  // Status after this result, on a copy of the matches with it (and its advances) applied.
  const after = matches.map(m => {
    let row = m.id === match.id ? { ...m, winner_id: winnerId, status: 'completed' as const } : m
    for (const a of advances) if (a.matchId === m.id) row = { ...row, [a.column]: a.teamId }
    return row
  })
  let nextStatus: TournamentStatus | null = null
  if (tournament.status !== 'completed' && tournament.status !== 'cancelled' && isTournamentDecided(after, tournament)) nextStatus = 'completed'
  else if (tournament.status === 'published' || tournament.status === 'draft') nextStatus = 'in_progress'
  const podium = nextStatus === 'completed' ? tournamentPodium(after, tournament, args.teamIds ?? [], args.tiebreakers) : null
  return { advances, nextStatus, podium, blocked: null }
}

/** Pool tables, in pool order; teams in each pool keep their pool order for full ties. */
export function poolTables(
  pools: readonly TournamentPoolWithTeams[],
  matches: readonly TournamentMatchRow[],
  tiebreakers: readonly TiebreakerKey[] = DEFAULT_TIEBREAKERS,
) {
  return [...pools]
    .sort((a, b) => a.display_order - b.display_order)
    .map(p => ({
      poolKey: p.id,
      name: p.name,
      rows: computeStandings(p.team_ids, matches.filter(m => m.pool_id === p.id), tiebreakers),
    }))
}

/** The final podium once the tournament is decided, else null. */
export function tournamentPodium(
  matches: readonly TournamentMatchRow[],
  tournament: Pick<Tournament, 'format' | 'bracket_type'>,
  teamIds: readonly string[],
  tiebreakers: readonly TiebreakerKey[] = DEFAULT_TIEBREAKERS,
): Podium | null {
  if (!isTournamentDecided(matches, tournament)) return null
  if (usesBracket(tournament.format)) {
    const plan = bracketPlanFor(matches, tournament)
    return plan ? bracketPodium(plan, keyedRows(bracketRows(matches), plan)) : null
  }
  return standingsPodium(computeStandings(teamIds, matches, tiebreakers))
}
