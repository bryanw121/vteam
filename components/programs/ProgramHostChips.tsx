import React from 'react'
import { ScrollView } from 'react-native'
import { theme } from '../../constants'
import { Chip } from '../ui'
import { programHosts } from '../../utils/externalPrograms'
import type { ProgramHostChipsProps } from '../../types'

/** Filter outside leagues or tournaments by who runs them. Nothing when there's only one host. */
export function ProgramHostChips({ programs, host, onSelect }: ProgramHostChipsProps) {
  const hosts = programHosts(programs)
  if (hosts.length < 2) return null
  const current = host && hosts.some(h => h.org === host) ? host : null
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm, paddingVertical: theme.spacing.sm }} accessibilityLabel="Filter by host">
      <Chip label="All hosts" badge={programs.length} active={!current} size="touch" onPress={() => onSelect(null)} testID="program-host-all" />
      {hosts.map(h => (
        <Chip key={h.org} label={h.org} badge={h.count} active={current === h.org} size="touch" onPress={() => onSelect(h.org)} testID={`program-host-${h.org}`} />
      ))}
    </ScrollView>
  )
}
