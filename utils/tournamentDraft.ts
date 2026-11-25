/**
 * The tournament creation wizard's rules (#325), pure so they can be tested:
 * defaults, which steps need what, and the rows a draft saves as. The screen
 * (`app/(app)/tournament/create.tsx`) and its step sections only draw them.
 */
import { DEFAULT_TIEBREAKERS } from '../lib/tournamentStandings'

/** The wizard's list: the standard four, then sets won, so a host can move it up (a new tournament only reaches it when the others leave a tie). */
const DRAFT_TIEBREAKERS = [...DEFAULT_TIEBREAKERS, 'sets_won'] as const
import { cleanDate } from './index'
import type { TournamentDraft, TournamentFormat, TournamentFormatOption, TournamentSaveStatus } from '../types'

export const TOURNAMENT_STEP_LABELS = ['Basics', 'Format', 'Registration', 'Rules', 'Preview'] as const
export const TOURNAMENT_TOTAL_STEPS = TOURNAMENT_STEP_LABELS.length

export const DEFAULT_TOURNAMENT_DRAFT: TournamentDraft = {
  title: '',
  clubId: '',
  location: '',
  skillLevels: [],
  startDate: null,
  registrationDeadline: null,
  description: '',
  format: 'pool_bracket',
  bracketType: 'single',
  teamsAdvancePerPool: 2,
  teamMode: 'captains',
  teamSize: 6,
  maxTeams: null,
  minRosterSize: 6,
  maxRosterSize: 10,
  hasRefs: false,
  price: 0,
  venmoHandle: '',
  startingScore: 0,
  winningScore: 25,
  decidingSetScore: 15,
  winByMargin: 2,
  pointCap: null,
  setsToWin: 2,
  tiebreakers: [...DRAFT_TIEBREAKERS],
  thirdPlaceMatch: false,
}

/** A fresh draft, with its own tiebreaker list. */
export function newTournamentDraft(): TournamentDraft {
  return { ...DEFAULT_TOURNAMENT_DRAFT, tiebreakers: [...DRAFT_TIEBREAKERS] }
}

export const TOURNAMENT_FORMAT_OPTIONS: readonly TournamentFormatOption[] = [
  { id: 'pool_bracket', icon: '🏊🏆', label: 'Pool Play + Bracket', description: 'Group stage, then elimination' },
  { id: 'bracket',      icon: '🏆',    label: 'Bracket Only',        description: 'Single or double elimination' },
  { id: 'pool_play',    icon: '🏊',    label: 'Pool Play Only',      description: 'Round robin within pools' },
  { id: 'round_robin',  icon: '🔄',    label: 'Full Round Robin',    description: 'Everyone plays everyone' },
]

export const TOURNAMENT_FORMAT_LABELS: Record<TournamentFormat, string> = {
  pool_bracket: 'Pool Play + Bracket',
  bracket:      'Bracket Only',
  pool_play:    'Pool Play Only',
  round_robin:  'Round Robin',
}

export function formatHasBracket(format: TournamentFormat): boolean {
  return format === 'pool_bracket' || format === 'bracket'
}

export function formatHasPools(format: TournamentFormat): boolean {
  return format === 'pool_bracket' || format === 'pool_play'
}

/** What is missing before leaving `step` (or saving from it), or null. */
export function validateTournamentStep(step: number, draft: TournamentDraft): string | null {
  if (step === 0) {
    if (!draft.title.trim()) return 'Please enter a tournament name.'
    if (!draft.clubId) return 'Please select a club.'
    if (!draft.startDate) return 'Please set a start date.'
  }
  if (step === 2) {
    if (draft.teamMode === 'captains' && draft.minRosterSize > draft.maxRosterSize) return 'Min roster cannot exceed max.'
    if (draft.teamMode === 'solo' && (draft.teamSize < 2 || draft.teamSize > 9)) return 'Teams need 2 to 9 players.'
  }
  return null
}

/** The first step (in order) with something missing, and what, or null when the draft can be saved. */
export function firstInvalidStep(draft: TournamentDraft): { step: number; message: string } | null {
  for (let step = 0; step < TOURNAMENT_TOTAL_STEPS; step++) {
    const message = validateTournamentStep(step, draft)
    if (message) return { step, message }
  }
  return null
}

/** A copy with item `i` moved one step up (-1) or down (1). */
export function moveItem<T>(items: readonly T[], i: number, by: -1 | 1): T[] {
  const j = i + by
  if (j < 0 || j >= items.length) return [...items]
  const next = [...items]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/**
 * What `save_tournament(p_tournament, p_rules)` takes for a draft (#325): the
 * tournament's columns and its rules. The server sets `created_by` and
 * `published_at`, trims text and checks the club.
 */
export function saveTournamentArgs(draft: TournamentDraft, status: TournamentSaveStatus) {
  const bracket = formatHasBracket(draft.format)
  // Solo (#282): sign-ups are one-player entries, so there is no team cap, and a
  // drawn team holds the chosen size or one more (sign-ups rarely divide evenly).
  const solo = draft.teamMode === 'solo'
  return {
    p_tournament: {
      club_id:                draft.clubId,
      title:                  draft.title.trim(),
      description:            draft.description.trim() || null,
      location:               draft.location.trim() || null,
      skill_levels:           draft.skillLevels,
      start_date:             draft.startDate ? cleanDate(draft.startDate) : null,
      registration_deadline:  draft.registrationDeadline ? cleanDate(draft.registrationDeadline) : null,
      status,
      format:                 draft.format,
      bracket_type:           bracket ? draft.bracketType : null,
      max_teams:              solo ? null : draft.maxTeams,
      min_roster_size:        solo ? Math.max(1, draft.teamSize - 1) : draft.minRosterSize,
      max_roster_size:        solo ? draft.teamSize + 1 : draft.maxRosterSize,
      teams_advance_per_pool: draft.teamsAdvancePerPool,
      has_refs:               draft.hasRefs,
      price:                  draft.price,
      venmo_handle:           draft.price > 0 ? (draft.venmoHandle.trim() || null) : null,
      team_mode:              draft.teamMode,
      team_size:              solo ? draft.teamSize : null,
    },
    p_rules: {
      starting_score:     draft.startingScore,
      winning_score:      draft.winningScore,
      deciding_set_score: draft.decidingSetScore,
      win_by_margin:      draft.winByMargin,
      point_cap:          draft.pointCap,
      sets_to_win:        draft.setsToWin,
      tiebreakers:        draft.tiebreakers,
      // Only a single-elimination bracket has a third-place match to play.
      third_place_match:  draft.thirdPlaceMatch && bracket && draft.bracketType === 'single',
    },
  }
}
