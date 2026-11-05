import { theme } from '../../constants'
import type { TeamSide } from '../../types'

/** Team A is violet and team B is cyan everywhere in the scorekeeper, so a glance tells them apart. */
export const TEAM_COLORS: Record<TeamSide, { fill: string; ink: string; soft: string }> = {
  A: { fill: theme.colors.primary, ink: theme.colors.onPrimary, soft: theme.colors.primarySoft },
  B: { fill: theme.colors.accent, ink: theme.colors.accentInk, soft: theme.colors.background },
}
