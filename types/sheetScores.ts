/**
 * Live scores from the Google Sheet tournament app (moonflour/volleyball-tournament): the JSON its
 * web app serves at `<exec URL>?format=json`. Fields the app leaves empty are dropped from the
 * JSON, so almost everything is optional.
 */

/** One row of the Sheet's Matches tab. Set scores are `s1_a`, `s1_b` … `s5_b`. */
export type SheetMatch = {
  match_id: string
  stage: 'pool' | 'bracket' | string
  /** Pool letter for pool games, division (Gold, Silver…) or a side-game group for bracket games. */
  group?: string
  round?: number | null
  court?: number | null
  team_a?: string
  team_b?: string
  status: 'scheduled' | 'live' | 'final' | 'void' | string
  /** A team name, or `TIE` for a 1–1 split in two-set pools. */
  winner?: string
  format?: string
  next_match?: string
  updated_at?: string
  updated_by?: string
  /** Bumped on every save; a save sends the version it started from, so two phones can't overwrite each other. */
  version?: number
} & Partial<Record<`s${1 | 2 | 3 | 4 | 5}_${'a' | 'b'}`, number | string>>

/** A planned pool game from the Sheet's Schedule tab. */
export type SheetScheduledGame = {
  pool: string
  game?: string
  court?: number | string
  time?: string
  a: string
  b: string
  status?: string
}

export type SheetStanding = {
  pool: string
  team: string
  played: number
  wins: number
  losses: number
  ties?: number
  sets_won: number
  sets_lost: number
  points_for: number
  points_against: number
  /** Share of sets won, 0–1. */
  set_pct?: number
  point_ratio?: number
  rank: number
}

export type SheetState = {
  settings: {
    tournament_name?: string
    divisions?: string[]
    refresh_seconds?: number
    /** `2sets` (1–1 is a tie), `bo3` or `1set`. */
    pool_format?: string
    bracket_format?: string
    set_target?: number
    /** The last set of a best-of is played to this (usually 15). */
    deciding_set_target?: number
    /** Set ends at this score even without a 2-point lead (null: win by 2). */
    point_cap?: number | null
    /** True when scorekeepers need a PIN. */
    pin_required?: boolean
  }
  /** Pool → team names. */
  pools: Record<string, string[]>
  schedule: SheetScheduledGame[]
  matches: SheetMatch[]
  /** Pool → standings, best first. */
  standings: Record<string, SheetStanding[]>
  seeds: { division: string; seed: number; team: string }[]
  serverTime?: string
}

/** A match on a court right now, with its sets so far (the last one is the set being played). */
export type SheetLiveMatch = {
  id: string
  court: number | null
  /** "Pool A" or "Gold · Semifinal". */
  label: string
  teamA: string
  teamB: string
  sets: { a: number; b: number }[]
}

/** One of a team's games, from the team's side. `result` is null for a game not finished or not started. */
export type SheetTeamGame = {
  id: string
  status: 'final' | 'live' | 'upcoming'
  result: 'W' | 'L' | 'T' | null
  /** Null for a bye or an opponent not decided yet (`bye` tells them apart). */
  opponent: string | null
  bye: boolean
  /** "Pool A" or "Gold · Semifinal 1". */
  label: string
  /** The team's points first: "25–21, 19–25". Court and time for upcoming games. */
  detail: string
}

/** Everything the team page shows. */
export type SheetTeamDetail = {
  name: string
  standing: SheetStanding
  poolSize: number
  seed: { division: string; seed: number } | null
  games: SheetTeamGame[]
}

/** The tabs of the scores screen. */
export type SheetScoresView = 'live' | 'pools' | 'brackets' | 'teams'

/** Opens a team's page; screens pass it to the tables and brackets. */
export type OnPressTeam = (team: string) => void

/** Set scores as the Sheet takes them: [team A, team B] per set, null for not started. */
export type SheetSetPair = [number | null, number | null]

/** The Sheet app's scoring call names, as its doPost accepts them. */
export type SheetScoringFn = 'startMatch' | 'submitScore' | 'cancelMatch' | 'checkPin'

/** What doPost answers. `match` comes back from start and save (and with a conflict: the other phone's copy). */
export type SheetScoringResult = {
  ok: boolean
  error?: 'bad_pin' | 'not_found' | 'not_started' | 'conflict' | 'bad_teams' | 'teams_not_set' | 'has_scores' | 'unknown_fn' | 'bad_request' | string
  match?: SheetMatch
  valid?: boolean
  existed?: boolean
}

/** A game the scorekeeper can pick: a scheduled pool pairing, or a bracket / pool match row. */
export type SheetKeepGame = {
  key: string
  /** Set when the game already has a Matches row (bracket games, and started pool games). */
  matchId: string | null
  pool: string | null
  teamA: string
  teamB: string
  status: 'scheduled' | 'live' | 'final'
  court: number | null
  /** "Pool A · Game 3 · 9:00 AM" or "Gold · Semifinal 1". */
  label: string
}

/** Where the scorekeeper's taps are: saved, waiting to send, sending, or failed (will retry). */
export type SheetSyncState = 'saved' | 'pending' | 'saving' | 'error' | 'conflict'
