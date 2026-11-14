/**
 * Find a team (#304): pure rules for the free-agent list on outside programs.
 */
import { normalizeVolleyballPositions } from './index'
import type { ExternalProgram, FreeAgent, FreeAgentDraft, FreeAgentFilter, FreeAgentWant, VolleyballPosition } from '../types'

export const FREE_AGENT_NOTE_MAX = 200

export const FREE_AGENT_WANTS: { key: FreeAgentWant; label: string; rowLabel: string }[] = [
  { key: 'partner', label: 'A partner', rowLabel: 'wants a partner' },
  { key: 'team', label: 'A team', rowLabel: 'wants a team' },
  { key: 'players', label: 'Players for my team', rowLabel: 'needs players' },
]

export const FREE_AGENT_POSITIONS: { key: VolleyballPosition; label: string }[] = [
  { key: 'setter', label: 'Setter' },
  { key: 'outside_hitter', label: 'OH' },
  { key: 'opposite_hitter', label: 'OPP' },
  { key: 'middle_blocker', label: 'MB' },
  { key: 'libero', label: 'Libero' },
  { key: 'defensive_specialist', label: 'DS' },
]

export const positionLabel = (p: VolleyballPosition) => FREE_AGENT_POSITIONS.find(x => x.key === p)?.label ?? p
export const wantRowLabel = (w: FreeAgentWant) => FREE_AGENT_WANTS.find(x => x.key === w)?.rowLabel ?? ''

/** Outside tournaments and leagues that haven't ended get a Find a team list. */
export function takesFreeAgents(p: Pick<ExternalProgram, 'kind' | 'starts_on' | 'ends_on'>, today: string): boolean {
  if (p.kind !== 'tournament' && p.kind !== 'league') return false
  const last = p.ends_on ?? p.starts_on
  return !last || last >= today
}

/** The strip's line under a program card. */
export function freeAgentStripText(count: number | null): string {
  if (!count) return 'Need a team or players?'
  return `${count} looking for a team`
}

/** A draft from the viewer's row, or from their profile's positions for a first entry. */
export function draftFrom(agent: FreeAgent | null, profilePositions: unknown): FreeAgentDraft {
  if (agent) return { want: agent.want, positions: normalizeVolleyballPositions(agent.positions), note: agent.note ?? '' }
  return { want: 'team', positions: normalizeVolleyballPositions(profilePositions), note: '' }
}

/** The columns a save writes (note trimmed, empty → null, capped). */
export function draftColumns(d: FreeAgentDraft): { want: FreeAgentWant; positions: VolleyballPosition[]; note: string | null } {
  const note = d.note.trim().slice(0, FREE_AGENT_NOTE_MAX)
  return { want: d.want, positions: [...new Set(d.positions)], note: note || null }
}

/** Rows to show for a filter: the viewer's own first, then newest first. */
export function visibleFreeAgents(list: FreeAgent[], filter: FreeAgentFilter, viewerId: string | null): FreeAgent[] {
  return list
    .filter(a => (filter.pos === 'any' || normalizeVolleyballPositions(a.positions).includes(filter.pos)) && (filter.want === 'any' || a.want === filter.want))
    .sort((a, b) => (a.user_id === viewerId ? -1 : b.user_id === viewerId ? 1 : b.created_at.localeCompare(a.created_at)))
}
