/**
 * The tournament creation wizard's rules (#325), pure so they can be tested:
 * defaults, which steps need what, and the rows a draft saves as. The screen
 * (`app/(app)/tournament/create.tsx`) and its step sections only draw them.
 */
import { DEFAULT_TIEBREAKERS } from '../lib/tournamentStandings'
import { phaseDiffers, phaseRulesArgs, phasesFor, rulesForPhase } from './tournamentPhases'

/** The wizard's list: the standard four, then sets won, so a host can move it up (a new tournament only reaches it when the others leave a tie). */
const DRAFT_TIEBREAKERS = [...DEFAULT_TIEBREAKERS, 'sets_won'] as const
import { cleanDate } from './index'
import type {
  Tournament, TournamentDraft, TournamentFormat, TournamentFormatOption, TournamentPlayerOption, TournamentRules,
  TournamentSaveStatus, TournamentTeamWithRoster,
} from '../types'

export const TOURNAMENT_STEP_LABELS = ['Basics', 'Format', 'Registration', 'Rules', 'Preview'] as const
export const TOURNAMENT_TOTAL_STEPS = TOURNAMENT_STEP_LABELS.length

export const DEFAULT_TOURNAMENT_DRAFT: TournamentDraft = {
  title: '',
  clubIds: [],
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
  phaseRules: {},
}

/** A fresh draft, with its own tiebreaker list. */
export function newTournamentDraft(): TournamentDraft {
  return { ...DEFAULT_TOURNAMENT_DRAFT, clubIds: [], tiebreakers: [...DRAFT_TIEBREAKERS], phaseRules: {} }
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
      club_id:                draft.clubIds[0] ?? null,
      club_ids:               draft.clubIds,
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
      // Later phases' own scoring, only what differs from the above (#404).
      phase_rules:        phaseRulesArgs(draft),
    },
  }
}

/**
 * A saved tournament as a wizard draft, for editing it (#402). Phases with their own
 * rules come back as full scoring (the wizard's shape); the rest follow the base.
 */
export function draftFromTournament(t: Tournament, rules: TournamentRules | null, clubIds: readonly string[]): TournamentDraft {
  const base = newTournamentDraft()
  const solo = t.team_mode === 'solo'
  const draft: TournamentDraft = {
    ...base,
    title: t.title,
    clubIds: clubIds.length ? [...clubIds] : t.club_id ? [t.club_id] : [],
    location: t.location ?? '',
    skillLevels: (t.skill_levels ?? []) as TournamentDraft['skillLevels'],
    startDate: t.start_date ? new Date(t.start_date) : null,
    registrationDeadline: t.registration_deadline ? new Date(t.registration_deadline) : null,
    description: t.description ?? '',
    format: t.format,
    bracketType: t.bracket_type ?? base.bracketType,
    teamsAdvancePerPool: t.teams_advance_per_pool ?? base.teamsAdvancePerPool,
    teamMode: solo ? 'solo' : 'captains',
    teamSize: solo && t.team_size ? t.team_size : base.teamSize,
    maxTeams: t.max_teams,
    minRosterSize: t.min_roster_size,
    maxRosterSize: t.max_roster_size,
    hasRefs: t.has_refs,
    price: Number(t.price ?? 0),
    venmoHandle: t.venmo_handle ?? '',
  }
  if (!rules) return draft
  const withRules: TournamentDraft = {
    ...draft,
    startingScore: rules.starting_score,
    winningScore: rules.winning_score,
    decidingSetScore: rules.deciding_set_score,
    winByMargin: rules.win_by_margin,
    pointCap: rules.point_cap,
    setsToWin: rules.sets_to_win,
    tiebreakers: rules.tiebreakers?.length ? [...rules.tiebreakers] as TournamentDraft['tiebreakers'] : base.tiebreakers,
    thirdPlaceMatch: !!rules.third_place_match,
    phaseRules: {},
  }
  for (const tab of phasesFor(withRules.format, withRules.bracketType)) {
    if (tab.key !== 'base' && phaseDiffers(rules, tab.key)) withRules.phaseRules[tab.key] = rulesForPhase(rules, tab.key)
  }
  return withRules
}

/** What `update_tournament` takes (#402): the same columns and rules as a create, minus the status, plus who hosts next. */
export function updateTournamentArgs(id: string, draft: TournamentDraft, newHostId: string | null) {
  const { p_tournament, p_rules } = saveTournamentArgs(draft, 'draft')
  const { status: _status, ...tournament } = p_tournament
  return { p_id: id, p_tournament: tournament, p_rules, p_new_host: newHostId }
}

/** Everyone on a team or signed up solo, once each, not `excludeId` (the host), by name (#402). */
export function tournamentPlayers(teams: readonly TournamentTeamWithRoster[], excludeId: string | null): TournamentPlayerOption[] {
  const seen = new Map<string, string>()
  for (const team of teams) {
    for (const m of team.members ?? []) {
      if (!m.user_id || m.user_id === excludeId || seen.has(m.user_id)) continue
      const p = m.profiles
      const name = p ? ([p.first_name, p.last_name].filter(Boolean).join(' ') || p.username || 'Player') : 'Player'
      seen.set(m.user_id, name)
    }
    if (team.captain_user_id && team.captain_user_id !== excludeId && !seen.has(team.captain_user_id)) seen.set(team.captain_user_id, 'Captain')
  }
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}

/** Owners and admins run a club; those clubs are listed first in the picker. */
export function isClubRunner(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

/** The picker's order: clubs the player runs, then the rest, each by name. */
export function sortTournamentClubs<T extends { name: string; role?: string | null }>(clubs: readonly T[]): T[] {
  return [...clubs].sort((a, b) => Number(isClubRunner(b.role)) - Number(isClubRunner(a.role)) || a.name.localeCompare(b.name))
}
