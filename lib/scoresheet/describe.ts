import type { MatchSetup, SanctionKind, ScoreEvent, StaffRole, TeamSide } from '../../types/scoresheet'

export const SANCTION_LABELS: Record<SanctionKind, string> = {
  'delay-warning': 'Delay warning',
  'delay-penalty': 'Delay penalty',
  warning: 'Warning (yellow card)',
  penalty: 'Penalty (red card)',
  expulsion: 'Expulsion',
  disqualification: 'Disqualification',
  'improper-request': 'Improper request',
}

/** Codes printed in the scoresheet's SANCTIONS box. */
export const SANCTION_CODES: Record<SanctionKind, string> = {
  'delay-warning': 'DW',
  'delay-penalty': 'DP',
  warning: 'W',
  penalty: 'P',
  expulsion: 'E',
  disqualification: 'D',
  'improper-request': 'IR',
}

export const STAFF_LABELS: Record<StaffRole, string> = { C: 'Coach', A: 'Assistant coach', T: 'Trainer', M: 'Manager' }

const nameOf = (setup: MatchSetup, side: TeamSide) => setup.teams[side].name.trim() || `Team ${side}`

export function playerLabel(setup: MatchSetup, side: TeamSide, n: number): string {
  const p = setup.teams[side].players.find(x => x.number === n)
  return p?.name ? `#${n} ${p.name}` : `#${n}`
}

export function whoLabel(setup: MatchSetup, side: TeamSide, who: number | StaffRole | undefined): string {
  if (who == null) return 'team'
  return typeof who === 'number' ? playerLabel(setup, side, who) : STAFF_LABELS[who].toLowerCase()
}

/** One line for the timeline. */
export function describeEvent(setup: MatchSetup, ev: ScoreEvent): string {
  switch (ev.type) {
    case 'set_start':
      return `Set started, ${nameOf(setup, ev.firstServe)} serving`
    case 'rally':
      return `Point ${nameOf(setup, ev.winner)}`
    case 'replay':
      return 'Rally replayed'
    case 'sub':
      return `${nameOf(setup, ev.team)}: ${playerLabel(setup, ev.team, ev.in)} in for #${ev.out}${ev.exceptional ? ' (exceptional)' : ''}`
    case 'libero_in':
      return `${nameOf(setup, ev.team)}: libero #${ev.libero} in for #${ev.replaces}`
    case 'libero_out':
      return `${nameOf(setup, ev.team)}: libero #${ev.libero} out`
    case 'timeout':
      return `Time-out ${nameOf(setup, ev.team)}`
    case 'sanction':
      return `${SANCTION_LABELS[ev.kind]}: ${nameOf(setup, ev.team)}, ${whoLabel(setup, ev.team, ev.who)}`
    case 'wrong_server':
      return ev.when === 'before-serve'
        ? `${nameOf(setup, ev.team)}: wrong server caught before the serve`
        : `${nameOf(setup, ev.team)}: wrong server${ev.when === 'discovered-later' ? ' (found later, points cancelled)' : ''}`
    case 'rotation_fault':
      return `${nameOf(setup, ev.team)}: out of rotation, point ${nameOf(setup, ev.team === 'A' ? 'B' : 'A')}`
    case 'override':
      return `Corrected: ${ev.reason}`
    case 'end_set':
      return `Set ended for ${nameOf(setup, ev.winner)}: ${ev.reason}`
    case 'note':
      return `Note: ${ev.text}`
  }
}
