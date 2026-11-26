import type {
  PhaseScoring, TournamentBracketType, TournamentDraft, TournamentFormat, TournamentPhase, TournamentPhaseRules,
} from '../types'

/**
 * Scoring rules per phase (#404). The base rules (`tournament_rules` columns) are the first phase's:
 * pool play, or every game when there's only one phase. A later phase can change any of them in
 * `phase_rules` ({ bracket: { starting_score: 0 } }); what it leaves out stays the base. Pure.
 */

export type PhaseTab = { key: 'base' | TournamentPhase; label: string }

/** The phases a format has, base first, with the words the host sees. */
export function phasesFor(format: TournamentFormat, bracketType: TournamentBracketType | null): PhaseTab[] {
  const pools = format === 'pool_bracket'
  const bracket = format === 'bracket' || pools
  if (!bracket) return [{ key: 'base', label: 'All games' }]
  const double = bracketType === 'double'
  const tabs: PhaseTab[] = pools
    ? [{ key: 'base', label: 'Pool play' }, { key: 'bracket', label: double ? 'Winners bracket' : 'Bracket' }]
    : [{ key: 'base', label: double ? 'Winners bracket' : 'Bracket' }]
  if (double) tabs.push({ key: 'losers', label: 'Losers bracket' })
  tabs.push({ key: 'final', label: double ? 'Finals' : 'Final' })
  return tabs
}

/** The base rules as the wizard holds them. */
export function baseScoring(d: Pick<TournamentDraft, 'startingScore' | 'winningScore' | 'decidingSetScore' | 'winByMargin' | 'pointCap' | 'setsToWin'>): PhaseScoring {
  return {
    startingScore: d.startingScore, winningScore: d.winningScore, decidingSetScore: d.decidingSetScore,
    winByMargin: d.winByMargin, pointCap: d.pointCap, setsToWin: d.setsToWin,
  }
}

type PhaseField = keyof NonNullable<TournamentPhaseRules[TournamentPhase]>

const SNAKE: Record<keyof PhaseScoring, PhaseField> = {
  startingScore: 'starting_score', winningScore: 'winning_score', decidingSetScore: 'deciding_set_score',
  winByMargin: 'win_by_margin', pointCap: 'point_cap', setsToWin: 'sets_to_win',
}

/**
 * `phase_rules` to save: only phases the format has, and in each only what differs from the base,
 * so a phase that was set back to the same rules disappears.
 */
export function phaseRulesArgs(draft: TournamentDraft): TournamentPhaseRules {
  const base = baseScoring(draft)
  const out: TournamentPhaseRules = {}
  for (const tab of phasesFor(draft.format, draft.bracketType)) {
    if (tab.key === 'base') continue
    const custom = draft.phaseRules[tab.key]
    if (!custom) continue
    const diff: Partial<Record<string, number | null>> = {}
    for (const k of Object.keys(SNAKE) as (keyof PhaseScoring)[]) {
      if (custom[k] !== base[k]) diff[SNAKE[k]] = custom[k]
    }
    if (Object.keys(diff).length) out[tab.key] = diff
  }
  return out
}

type RulesRow = {
  starting_score: number; winning_score: number; deciding_set_score: number; win_by_margin: number
  point_cap: number | null; sets_to_win: number; phase_rules?: TournamentPhaseRules | null
}

/** The rules a phase plays by: the base with that phase's changes on top. */
export function rulesForPhase(rules: RulesRow, phase: 'base' | TournamentPhase): PhaseScoring {
  const base: PhaseScoring = {
    startingScore: rules.starting_score, winningScore: rules.winning_score, decidingSetScore: rules.deciding_set_score,
    winByMargin: rules.win_by_margin, pointCap: rules.point_cap, setsToWin: rules.sets_to_win,
  }
  if (phase === 'base') return base
  const change = rules.phase_rules?.[phase] ?? {}
  const out = { ...base }
  for (const k of Object.keys(SNAKE) as (keyof PhaseScoring)[]) {
    const v = change[SNAKE[k]]
    if (v !== undefined) (out[k] as number | null) = v
  }
  return out
}

/** Whether a phase plays by different rules than the base (the Overview lists only those). */
export function phaseDiffers(rules: RulesRow, phase: TournamentPhase): boolean {
  return Object.keys(rules.phase_rules?.[phase] ?? {}).length > 0
}

/** "0–0 start · to 25, deciding set to 15 · win by 2 · cap 27 · best of 3": one phase's rules in a line. */
export function describeScoring(s: PhaseScoring): string {
  return [
    `${s.startingScore}–${s.startingScore} start`,
    `to ${s.winningScore}, deciding set to ${s.decidingSetScore}`,
    s.winByMargin === 1 ? 'win by 1' : `win by ${s.winByMargin}`,
    s.pointCap ? `cap ${s.pointCap}` : 'no cap',
    s.setsToWin === 1 ? '1 set' : `best of ${s.setsToWin * 2 - 1}`,
  ].join(' · ')
}
