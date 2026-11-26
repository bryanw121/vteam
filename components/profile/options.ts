import { SKILL_LEVEL_LABELS } from '../../constants/copy'
import type { VolleyballPosition, VolleyballSkillLevel } from '../../types'

export const VOLLEYBALL_POSITION_OPTIONS: { value: VolleyballPosition; label: string }[] = [
  { value: 'setter', label: 'Setter' },
  { value: 'libero', label: 'Libero' },
  { value: 'outside_hitter', label: 'Outside Hitter (OH)' },
  { value: 'middle_blocker', label: 'Middle Blocker (MB)' },
  { value: 'defensive_specialist', label: 'Defensive Specialist (DS)' },
  { value: 'opposite_hitter', label: 'Opposite Hitter (OPP)' },
]

export const VOLLEYBALL_SKILL_LEVEL_OPTIONS: { value: VolleyballSkillLevel; label: string }[] = [
  // Best first, like every level list (#401).
  { value: 'aa_plus', label: SKILL_LEVEL_LABELS.aa_plus },
  { value: 'a',       label: SKILL_LEVEL_LABELS.a },
  { value: 'bb',      label: SKILL_LEVEL_LABELS.bb },
  { value: 'b',       label: SKILL_LEVEL_LABELS.b },
  { value: 'c',       label: SKILL_LEVEL_LABELS.c },
  { value: 'd',       label: 'D (Newbie)' },
]

/**
 * "Outside Hitter (OH)" → "OH": the compact label used on the hero's position
 * chips. (The old inline version replaced the name but kept the suffix and
 * rendered "OH (OH)".)
 */
export function shortPositionLabel(position: VolleyballPosition): string {
  const label = VOLLEYBALL_POSITION_OPTIONS.find(o => o.value === position)?.label ?? position
  return label.match(/\(([A-Z]+)\)$/)?.[1] ?? label
}
