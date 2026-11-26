import { describeScoring, phaseDiffers, phaseRulesArgs, phasesFor, rulesForPhase } from '../utils/tournamentPhases'
import { newTournamentDraft } from '../utils/tournamentDraft'

const base = { starting_score: 4, winning_score: 25, deciding_set_score: 15, win_by_margin: 2, point_cap: null, sets_to_win: 2 }

describe('scoring rules per phase (#404)', () => {
  it('lists the phases a format has, base first', () => {
    expect(phasesFor('pool_play', null).map(t => t.label)).toEqual(['All games'])
    expect(phasesFor('pool_bracket', 'single').map(t => t.key)).toEqual(['base', 'bracket', 'final'])
    expect(phasesFor('pool_bracket', 'double').map(t => t.label)).toEqual(['Pool play', 'Winners bracket', 'Losers bracket', 'Finals'])
    expect(phasesFor('bracket', 'double').map(t => t.key)).toEqual(['base', 'losers', 'final'])
  })

  it('saves only what a phase changes, and only phases the format has', () => {
    const d = { ...newTournamentDraft(), format: 'pool_bracket' as const, bracketType: 'single' as const, startingScore: 4 }
    d.phaseRules = {
      bracket: { startingScore: 0, winningScore: 25, decidingSetScore: 15, winByMargin: 2, pointCap: 27, setsToWin: 2 },
      final: { startingScore: 4, winningScore: 25, decidingSetScore: 15, winByMargin: 2, pointCap: null, setsToWin: 2 },
      losers: { startingScore: 0, winningScore: 21, decidingSetScore: 15, winByMargin: 2, pointCap: null, setsToWin: 2 },
    }
    // final is the same as the base, losers isn't a phase of a single bracket.
    expect(phaseRulesArgs(d)).toEqual({ bracket: { starting_score: 0, point_cap: 27 } })
  })

  it('reads a phase as the base with its changes on top', () => {
    const rules = { ...base, phase_rules: { bracket: { starting_score: 0, point_cap: 27 } } }
    expect(rulesForPhase(rules, 'bracket')).toMatchObject({ startingScore: 0, pointCap: 27, winningScore: 25, setsToWin: 2 })
    expect(rulesForPhase(rules, 'losers').startingScore).toBe(4)
    expect(phaseDiffers(rules, 'bracket')).toBe(true)
    expect(phaseDiffers(rules, 'final')).toBe(false)
    expect(phaseDiffers({ ...base }, 'bracket')).toBe(false)
  })

  it('describes a phase in one line', () => {
    expect(describeScoring(rulesForPhase({ ...base, phase_rules: { bracket: { starting_score: 0, point_cap: 27, sets_to_win: 1 } } }, 'bracket')))
      .toBe('0–0 start · to 25, deciding set to 15 · win by 2 · cap 27 · 1 set')
  })
})
