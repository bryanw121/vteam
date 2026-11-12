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
  /** Starting score per set index, both teams (NAGVA pool play starts at 4-4); missing = 0. */
  setStarts?: number[]
  /** Cap per set index, overriding `cap` (e.g. 27 for sets to 25, none for the deciding set). */
  setCaps?: (number | null)[]
  /** Match time limit in minutes, counted from the first serve; null/missing = untimed. */
  timeLimitMinutes?: number | null
}

export type ScoreRules = {
  preset: RulesPreset
  format: MatchFormat
  /** Substitutions per team per set; null = unlimited. */
  subsPerSet: number | null
  timeoutsPerSet: number
  /** Length of a time-out, for the countdown (older matches: 30). */
  timeoutSeconds?: number
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
  /** No longer asked for or printed; old saved matches may still carry it. */
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
 * Out of rotation at the moment of the serve (players out of position / overlapping), by either
 * team. The other team gets the point (and the serve, if it didn't have it).
 */
export type RotationFaultEvent = EventBase & { type: 'rotation_fault'; team: TeamSide }
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
/**
 * The match clock ran out. The set in progress goes to the team ahead; if tied, the next point
 * decides it. No further sets are played.
 */
export type TimeUpEvent = EventBase & { type: 'time_up' }
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
  | RotationFaultEvent
  | OverrideEvent
  | EndSetEvent
  | TimeUpEvent
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
  /** "Copy to paper" steps the scorer has ticked off (CopyStep ids). */
  copied?: string[]
  /** The built-in example match (lib/scoresheet/exampleMatch): kept out of the saved-matches list. */
  example?: boolean
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
/** `start`: points a set began with (sets starting at 4-4). */
export type PointMark = 'rally' | 'penalty' | 'cancelled' | 'start'

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
  | 'timeout-late'
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
  /** Point numbers this team scored on a libero's serve (triangled in the points column, USAV S6.2.2a). */
  liberoPoints: number[]
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
  /** Cap for this set (null = none) and the score both teams started from. */
  cap: number | null
  startScore: number
  /** Time ran out with the set tied: the next point wins it. */
  nextPointWins: boolean
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
  /** The match clock ran out (time_up recorded). */
  timeExpired: boolean
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

/**
 * One mark on the official USA Volleyball form (lib/scoresheet/officialLayout.ts). Coordinates are
 * points on the page as it is read (landscape, 792 × 612), measured from the top left; text `y`
 * is the baseline. `page` indexes `OfficialSheetLayout.pages`.
 */
export type SheetOp =
  | { kind: 'text'; page: number; x: number; y: number; text: string; size: number; align?: 'left' | 'center' | 'right'; maxWidth?: number; bold?: boolean }
  | { kind: 'line'; page: number; x1: number; y1: number; x2: number; y2: number; width?: number }
  | { kind: 'ellipse'; page: number; cx: number; cy: number; rx: number; ry: number; width?: number }
  /** Paint white over printed text (a "Set 1" label on a continuation sheet). */
  | { kind: 'cover'; page: number; x: number; y: number; w: number; h: number }

/** `form`: a copy of the official sheet; `plain`: a blank landscape page (remarks that don't fit). */
export type OfficialSheetLayout = { pages: ('form' | 'plain')[]; ops: SheetOp[] }

/** Measures text width in points (the PDF font in the app, an estimate in tests). */
export type MeasureText = (text: string, size: number, bold?: boolean) => number

export type OfficialSheetButtonProps = { doc: MatchDoc; state: MatchState }

/** A team saved on the device for one-tap setup next time (lib/scoresheet/teamStore.ts). */
export type SavedTeam = {
  name: string
  /** Starting six in lineup order (position I first), then the bench. */
  court: RosterPlayer[]
  bench: RosterPlayer[]
  updatedAt: number
}

/** Match details carried to the next match of the same day (same tournament, same court). */
export type SavedMatchInfo = { info: MatchInfo; savedAt: number }

/** An area of the paper form, in points on the landscape page (792 × 612), from the top left. */
export type SheetRegion = { x: number; y: number; w: number; h: number }

/** One block of what to write in a "Copy to paper" step. */
export type CopySection =
  /** Six boxes under I–VI (lineup, service rounds). */
  | { kind: 'grid'; title: string; cells: { label: string; value: string }[] }
  /** Label / value lines. */
  | { kind: 'rows'; title?: string; rows: { label: string; value: string }[]; empty?: string }
  /** A big number with an instruction (running score). */
  | { kind: 'big'; title: string; value: string; detail: string }

/** One step of "Copy to paper": a part of the form, in the order the paper lays it out. */
export type CopyStep = {
  id: string
  title: string
  /** Where on the form, in words. */
  where: string
  /** Sheet number (1-based; sets 3–4 are on sheet 2) and the areas to highlight on the map. */
  sheet: number
  regions: SheetRegion[]
  sections: CopySection[]
}

export type CopySectionProps = { section: CopySection }
/** What changed on the form between two layouts (lib/scoresheet/liveSheet.ts): areas to show the user. */
export type SheetMarkDiff = { added: SheetRegion[]; removed: SheetRegion[] }

/** The part of the form a set is written in: which copy of the form, and where on it. */
export type SetArea = { page: number; region: SheetRegion }

/** How the live scoresheet frames the form: the latest change (phones), the current set, or the whole form. */
export type LiveSheetZoom = 'follow' | 'set' | 'form'

export type LiveSheetPanelProps = {
  doc: MatchDoc
  state: MatchState
  /** Index of the set being played (its block on the form). */
  setIndex: number
  onOpenSheet: () => void
}

export type OfficialSheetViewProps = {
  layout: OfficialSheetLayout
  /** Page of the layout (0 = the first copy of the form). */
  page?: number
  /** Zoom to these areas (with some room around them); the whole sheet when omitted. */
  focus?: SheetRegion[]
  /** Areas to tint, e.g. the part of the form a Copy to paper step is about. */
  highlight?: SheetRegion[]
  /** Areas where marks were just erased (an undo): outlined, not tinted. */
  erased?: SheetRegion[]
  accessibilityLabel?: string
  testID?: string
}
export type MatchDetailsCardProps = { info: MatchInfo; onChange: (patch: Partial<MatchInfo>) => void }
export type SavedTeamsPickerProps = { teams: SavedTeam[]; target: TeamSide | null; targetLabel: string; onPick: (team: SavedTeam) => void }

