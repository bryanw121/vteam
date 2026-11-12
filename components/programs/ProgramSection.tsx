import React from 'react'
import { View } from 'react-native'
import { Text } from '../ui/Text'
import { shared } from '../../constants'
import { ExternalProgramCard } from '../ExternalProgramCard'
import type { ProgramSectionProps } from '../../types'

/** A titled group of outside leagues or tournaments (Leagues and Tournaments screens). Nothing when empty. */
export function ProgramSection({ title, programs, hot = false, testID }: ProgramSectionProps) {
  if (!programs.length) return null
  return (
    <View testID={testID}>
      <Text accessibilityRole="header" style={[shared.programSectionTitle, hot && shared.programSectionTitleHot]}>
        {title} · {programs.length}
      </Text>
      {programs.map(p => <ExternalProgramCard key={p.id} program={p} compact />)}
    </View>
  )
}
