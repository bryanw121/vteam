/**
 * Types for the experimental scorekeeper (lib/scoresheet). A match is an append-only log of
 * what the scorer recorded (`ScoreEvent`); everything on screen and on the finished scoresheet
 * is derived by replaying that log (`MatchState`). Re-exported from types/index.ts.
 */
import type { Href } from 'expo-router'
import type { IoniconName } from './index'

export type TeamSide = 'A' | 'B'

/** Six player numbers, lineup slots I..VI (slot I serves first). */
export type Lineup = readonly [number, number, number, number, number, number]

// ─── Setup ────────────────────────────────────────────────────────────────────

export type RosterPlayer = {
  number: number
  name?: string
  libero?: boolean
  captain?: boolean
}

export type TeamSetup = {
  name: string
  players: RosterPlayer[]
}

/**
 * How substitutes may come back in:
 * - `same-position`: any number of entries, but a player always plays the same lineup slot
 *   in a set (USA Volleyball domestic).
 * - `starter-once`: a starter may leave once and come back once, only for the player who
 *   replaced them; a substitute enters once, for that starter (international).
 * - `free`: no re-entry rule (rec play).
 */
export type ReentryRule = 'same-position' | 'starter-once' | 'free'

/** Which lineup slots a libero may serve in: one per set (USAV), never, or any. */
export type LiberoServeRule = 'one-position' | 'never' | 'any'

export type RulesPreset = 'usav' | 'international' | 'casual'

export type MatchFormat = {
  /** Most sets that can be played. */
  maxSets: number
  /** Sets needed to win the match; null = every set is played (pool play, may split). */
  setsToWin: number | null
  /** Target score per set, by set index (the last entry repeats). */
  setPoints: number[]
  winBy: number
  /** A set ends at this score even without a 2-point lead; null = no cap. */
  cap: number | null
}

export type ScoreRules = {
  preset: RulesPreset
  format: MatchFormat
  /** Substitutions per team per set; null = unlimited. */
  subsPerSet: number | null
  timeoutsPerSet: number
  reentry: ReentryRule
  liberoServe: LiberoServeRule
  /** Track libero replacements (warns when a libero rotates to the front row). */
  trackLibero: boolean
}

export type MatchInfo = {
  competition?: string
  matchNo?: string
  division?: string
  city?: string
  hall?: string
  court?: string
  /** ISO date (yyyy-mm-dd) */
  date?: string
  gender?: 'men' | 'women' | 'coed'
  firstReferee?: string
  secondReferee?: string
  scorer?: string
}

export type MatchSetup = {
  info: MatchInfo
  teams: Record<TeamSide, TeamSetup>
  rules: ScoreRules
}

// ─── Events (what the scorer recorded) ─────────────────────────────────────────

export type StaffRole = 'C' | 'A' | 'T' | 'M'
export type SanctionKind =
  | 'delay-warning'
  | 'delay-penalty'
  | 'warning'
  | 'penalty'
  | 'expulsion'
  | 'disqualification'
  | 'improper-request'

type EventBase = { id: string; at: number }

export type SetStartEvent = EventBase & {
  type: 'set_start'
  lineups: Record<TeamSide, Lineup>
  firstServe: TeamSide
  liberos: Record<TeamSide, number[]>
}
export type RallyEvent = EventBase & { type: 'rally'; winner: TeamSide }
/** A rally the referee ordered replayed: no point, logged for the record. */
export type ReplayEvent = EventBase & { type: 'replay' }
export type SubEvent = EventBase & { type: 'sub'; team: TeamSide; out: number; in: number; exceptional?: boolean }
export type LiberoInEvent = EventBase & { type: 'libero_in'; team: TeamSide; libero: number; replaces: number }
export type LiberoOutEvent = EventBase & { type: 'libero_out'; team: TeamSide; libero: number }
export type TimeoutEvent = EventBase & { type: 'timeout'; team: TeamSide }
export type SanctionEvent = EventBase & {
  type: 'sanction'
  team: TeamSide
  kind: SanctionKind
  /** Player number, staff role, or undefined for a team sanction (delay, improper request). */
  who?: number | StaffRole
}
/**
 * Wrong server. `when`:
 * - `after-serve`: caught as it happened: the rally goes to the opponent.
 * - `discovered-later`: the points the team scored since `sinceEventId` (the first rally the
 *   wrong player served) are cancelled, then the opponent gets the point and the serve.
 * - `before-serve`: caught before the serve: no penalty, a note on the sheet.
 */
export type WrongServerEvent = EventBase & {
  type: 'wrong_server'
  team: TeamSide
  when: 'after-serve' | 'discovered-later' | 'before-serve'
  sinceEventId?: string
}
/**
 * Last resort: make the app match the court (the official scoreboard, who is serving, who is
 * standing where). Every override is written into Remarks with its reason.
 */
export type OverrideEvent = EventBase & {
  type: 'override'
  reason: string
  score?: Record<TeamSide, number>
  serving?: TeamSide
  /** Rotation offset per team: which lineup slot (0-5) is in position I. */
  rotation?: Partial<Record<TeamSide, number>>
}
/** End the set now (forfeit, default, time limit), naming the winner. */
export type EndSetEvent = EventBase & { type: 'end_set'; winner: TeamSide; reason: string }
export type NoteEvent = EventBase & { type: 'note'; text: string }

export type ScoreEvent =
  | SetStartEvent
  | RallyEvent
  | ReplayEvent
  | SubEvent
  | LiberoInEvent
  | LiberoOutEvent
  | TimeoutEvent
  | SanctionEvent
  | WrongServerEvent
  | OverrideEvent
  | EndSetEvent
  | NoteEvent

/** An event before the log stamps it with an id and time. */
export type ScoreEventInput = ScoreEvent extends infer E ? (E extends ScoreEvent ? Omit<E, 'id' | 'at'> : never) : never

/** One change to the log, stored with enough to undo it. */
export type LogOp =
  | { kind: 'append'; event: ScoreEvent }
  | { kind: 'insert'; index: number; event: ScoreEvent }
  | { kind: 'remove'; index: number; event: ScoreEvent }
  | { kind: 'replace'; index: number; before: ScoreEvent; after: ScoreEvent }

export type MatchHistory = { undo: LogOp[]; redo: LogOp[] }

/** A match as saved on the device: setup, the log, and undo/redo history. */
export type MatchDoc = MatchHistory & {
  id: string
  createdAt: number
  updatedAt: number
  setup: MatchSetup
  log: ScoreEvent[]
  /** Save counter: the newer of the two saved copies wins on load. */
  seq?: number
}

/** A row in the saved-matches list. */
export type MatchSummary = {
  id: string
  title: string
  updatedAt: number
  /** Live until the match is over. */
  status: 'live' | 'final'
  score: string
}

// ─── Derived state ────────────────────────────────────────────────────────────

/** How a point is drawn on the running score. */
export type PointMark = 'rally' | 'penalty' | 'cancelled'

export type ServiceTurn = {
  /** Team score when this turn ended (written in the service-round box); null while serving. */
  endScore: number | null
  /** Points scored during the turn. */
  points: number
  server: number
}

export type SubRecord = {
  team: TeamSide
  slot: number
  out: number
  in: number
  /** [this team, opponent] at the moment of the substitution. */
  score: [number, number]
  exceptional: boolean
  eventId: string
}

export type TimeoutRecord = { team: TeamSide; score: [number, number]; eventId: string }

export type SanctionRecord = {
  team: TeamSide
  kind: SanctionKind
  who?: number | StaffRole
  set: number
  score: [number, number]
  eventId: string
}

export type WarningCode =
  | 'sub-limit'
  | 'sub-not-on-court'
  | 'sub-already-on-court'
  | 'sub-not-on-roster'
  | 'sub-reentry'
  | 'sub-libero'
  | 'timeout-limit'
  | 'libero-front-row'
  | 'libero-serve'
  | 'libero-not-libero'
  | 'libero-not-on-court'
  | 'lineup-invalid'
  | 'set-not-started'
  | 'set-over'
  | 'match-over'
  | 'wrong-server-unknown-start'

export type Warning = { code: WarningCode; message: string; eventId: string; set: number }

export type TeamSetState = {
  lineup: Lineup
  /** Who is in each lineup slot now (subs applied; libero not applied). */
  slots: number[]
  /** Lineup slot in position I (rotation offset). */
  rotation: number
  score: number
  marks: PointMark[]
  /** Service turns per lineup slot, in order. */
  turns: ServiceTurn[][]
  timeouts: TimeoutRecord[]
  subs: SubRecord[]
  /** Every player who has played each slot this set (re-entry checks). */
  slotHistory: number[][]
  /** Libero on court and the player they replaced. */
  libero: { libero: number; replaces: number } | null
  liberos: number[]
  /** Lineup slot the libero served in this set, if any. */
  liberoServeSlot: number | null
  /** Points scored while serving out of rotation and then cancelled. */
  cancelled: number
}

export type SetState = {
  index: number
  teams: Record<TeamSide, TeamSetState>
  firstServe: TeamSide
  serving: TeamSide
  /** True until the first serve of the set has been played. */
  firstRally: boolean
  startedAt: number
  endedAt: number | null
  winner: TeamSide | null
  endReason: string | null
  /** The set point target and whether a court switch is due (deciding set at the halfway point). */
  target: number
  courtSwitchAt: number | null
  courtSwitched: boolean
  rallies: number
}

export type MatchState = {
  sets: SetState[]
  /** Index into `sets` of the set being played, or null between sets / before the first. */
  current: number | null
  setsWon: Record<TeamSide, number>
  winner: TeamSide | null
  /** True when the match is decided (or every set of a pool-play match is played). */
  over: boolean
  sanctions: SanctionRecord[]
  /** Improper requests per team (the IMPROPER REQUEST box). */
  improperRequests: Record<TeamSide, boolean>
  warnings: Warning[]
  remarks: string[]
}

/** A card on Settings → Experimental features (constants/experiments.ts). */
export type Experiment = {
  id: string
  title: string
  body: string
  icon: IoniconName
  href: Href & string
}

export type ScoresheetPreviewProps = {
  html: string
  title: string
  /** Native summary shown under the export button (web shows the sheet itself). */
  children?: import('react').ReactNode
}
