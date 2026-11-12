/**
 * Types for the tournament engine (lib/tournamentSchedule, lib/tournamentBracket,
 * lib/tournamentStandings) and the Results tab. Re-exported from types/index.ts.
 */
import type { Tournament, TournamentBracketType, TournamentStatus } from './index'

// ─── Pools ────────────────────────────────────────────────────────────────────

/** A registered team as the generators see it. `seed` 1 = strongest; null = unseeded. */
export type SeededTeam = { id: string; seed: number | null }

export type PoolAssignInput = {
  teams: readonly SeededTeam[]
  numPools: number
  /** Injected for tests; shuffles unseeded teams. */
  random?: () => number
  /**
   * Pairs to keep apart (key from `pairKey(a, b)`), weighted. The assigner swaps
   * same-tier teams between pools while that lowers the total weight of pairs
   * that share a pool, so seeding balance and pool sizes never change.
   */
  avoid?: ReadonlyMap<string, number>
}

// ─── Round robin slot packing ────────────────────────────────────────────────

/** Who plays whom in one pool (or the whole field), as circle-method rounds. */
export type RoundRobinGroup = { poolKey: string | null; teamIds: readonly string[]; rounds: [string, string][][] }

/** A packed match: which time slot and court it got, and who referees it. */
export type PackedMatch = {
  poolKey: string | null
  /** Circle-method round it came from (1-based). */
  round: number
  teamA: string
  teamB: string
  /** 0-based time slot. */
  slot: number
  /** 0-based court within the slot. */
  court: number
  refTeamId: string | null
}

export type PackOptions = {
  numCourts: number
  /** Assign a referee team to every match when an idle team exists. */
  refs: boolean
  /** Guarantee a break: no team plays two slots in a row when it can be avoided. */
  rest?: boolean
}

// ─── Bracket ──────────────────────────────────────────────────────────────────

/** Where a bracket slot's team comes from. Seeds are 1-based. */
export type BracketSource =
  | { kind: 'seed'; seed: number }
  | { kind: 'winner'; node: string }
  | { kind: 'loser'; node: string }

export type BracketSlot = 'a' | 'b'
export type BracketLink = { node: string; slot: BracketSlot }

/**
 * One match position in the full (power-of-two) bracket. Keys: `W<round>-<n>`
 * (winners / single bracket), `L<round>-<n>` (losers bracket), `GF` (grand final,
 * double elimination), `TP` (third-place match, single elimination).
 */
export type BracketNode = {
  key: string
  side: 'W' | 'L' | 'GF' | 'TP'
  round: number
  match: number
  name: string
  sources: [BracketSource, BracketSource]
  winnerTo: BracketLink | null
  loserTo: BracketLink | null
}

export type BracketPlan = {
  type: TournamentBracketType
  /** Bracket size: the next power of two at or above the team count. */
  size: number
  /** Winners-bracket rounds: log2(size). */
  rounds: number
  thirdPlace: boolean
  nodes: Record<string, BracketNode>
}

/**
 * live: two real teams will meet. pass: only one team can arrive (a bye), so
 * it moves straight on and no match row exists. dead: nobody arrives.
 */
export type BracketNodeState = 'live' | 'pass' | 'dead'

/** A bracket match row to insert (live nodes only). Team ids are null until known. */
export type BracketMatchInsert = {
  key: string
  stage: 'bracket'
  round: number
  match_number: number
  is_losers_bracket: boolean
  bracket_round_name: string
  team_a_id: string | null
  team_b_id: string | null
  /** Earliest play order: every source match is in a lower wave. */
  wave: number
}

/** A slot assignment produced by recording a bracket result. */
export type BracketAdvance = { key: string; slot: BracketSlot; teamId: string }

export type Podium = { first: string | null; second: string | null; thirds: string[] }

// ─── Standings ────────────────────────────────────────────────────────────────

export type TiebreakerKey = 'head_to_head' | 'set_ratio' | 'point_diff' | 'points_for'

export type SetScore = { set_number: number; team_a_score: number; team_b_score: number }

/** The parts of a match standings need. */
export type StandingMatch = {
  team_a_id: string | null
  team_b_id: string | null
  winner_id: string | null
  status: string
  sets: readonly SetScore[]
}

export type StandingRow = {
  teamId: string
  played: number
  wins: number
  losses: number
  setsWon: number
  setsLost: number
  pointsFor: number
  pointsAgainst: number
  /** 1-based; teams tied on every tiebreaker share a rank. */
  rank: number
  tied: boolean
}

export type PoolStandings = { poolKey: string; name: string; rows: StandingRow[] }

/** One editable set row in the result sheet (strings while typing). */
export type SetScoreDraft = { a: string; b: string }

// ─── Results ──────────────────────────────────────────────────────────────────

/** A pool with its team ids (tournament_pools + tournament_pool_teams). */
export type TournamentPoolWithTeams = { id: string; name: string; display_order: number; team_ids: string[] }

/** What recording one result has to write (lib/tournamentResults `resultWrites`). */
export type TournamentResultWrites = {
  advances: { matchId: string; column: 'team_a_id' | 'team_b_id'; teamId: string }[]
  nextStatus: TournamentStatus | null
  /** The final podium whenever the tournament is decided after this result (trophies follow it), else null. */
  podium: Podium | null
  /** Why the result can't be recorded as is, or null. */
  blocked: string | null
}

/** A tournament row as the Tournaments list shows it. */
export type TournamentListItem = Pick<Tournament, 'id' | 'title' | 'location' | 'start_date' | 'status' | 'format' | 'club_id' | 'max_teams'> & {
  club_name: string | null
  team_count: number
}

/** A trophy on a player's profile (tournament_trophies). */
export type UserTrophy = {
  id: string
  tournament_id: string
  place: 1 | 2 | 3
  tournament_title: string
  tournament_date: string
  team_name: string
}
