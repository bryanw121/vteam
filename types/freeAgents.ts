import type { Tables } from './database'
import type { ExternalProgram, Profile, VolleyballPosition } from './index'

/** What a player on a Find a team list is after (#304). */
export type FreeAgentWant = 'partner' | 'team' | 'players'

/** The public profile bits shown on a Find a team row. */
export type FreeAgentProfile = Pick<Profile, 'id' | 'username' | 'first_name' | 'last_name' | 'avatar_url' | 'skill_level' | 'position'>

/** One `program_free_agents` row with its player. */
export type FreeAgent = Omit<Tables<'program_free_agents'>, 'want' | 'positions'> & {
  want: FreeAgentWant
  positions: VolleyballPosition[]
  profiles: FreeAgentProfile | null
}

/** The I'm looking form. */
export type FreeAgentDraft = { want: FreeAgentWant; positions: VolleyballPosition[]; note: string }

export type FreeAgentFilter = { pos: VolleyballPosition | 'any'; want: FreeAgentWant | 'any' }

export type FreeAgentStripProps = {
  program: Pick<ExternalProgram, 'id' | 'title'>
  /** null while unknown (no count call on this list): the strip shows its general line. */
  count: number | null
}

export type FreeAgentRowProps = {
  agent: FreeAgent
  mine: boolean
  onMessage: () => void
  onReport: () => void
  onEdit: () => void
  messaging: boolean
}

export type FreeAgentSheetProps = {
  visible: boolean
  programTitle: string
  initial: FreeAgentDraft
  editing: boolean
  saving: boolean
  onSave: (draft: FreeAgentDraft) => void
  onRemove: () => void
  onDismiss: () => void
}
