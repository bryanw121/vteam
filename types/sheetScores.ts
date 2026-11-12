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
  rank: number
}

export type SheetState = {
  settings: {
    tournament_name?: string
    divisions?: string[]
    refresh_seconds?: number
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

/** The tabs of the scores screen. */
export type SheetScoresView = 'live' | 'pools' | 'brackets'
