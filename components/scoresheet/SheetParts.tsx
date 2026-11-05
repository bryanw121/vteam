import type { ReactNode } from 'react'
import { ScrollView, View } from 'react-native'
import { useWindowDimensions } from 'react-native'
import { Text } from '../ui/Text'
import { Chip } from '../ui'
import { shared, theme } from '../../constants'
import { teamName } from '../../lib/scoresheet/summary'
import type { MatchDoc, TeamSide } from '../../types'

/** Picks team A or B inside a sheet. */
export function TeamPicker({ doc, value, onChange, testID }: { doc: MatchDoc; value: TeamSide; onChange: (t: TeamSide) => void; testID?: string }) {
  return (
    <View role="radiogroup" style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }} testID={testID}>
      {(['A', 'B'] as const).map(side => (
        <Chip key={side} label={teamName(doc, side)} role="radio" active={value === side} onPress={() => onChange(side)} testID={testID ? `${testID}-${side}` : undefined} />
      ))}
    </View>
  )
}

/** Scrollable body for a bottom sheet, capped so the sheet never covers the whole screen. */
export function SheetBody({ children }: { children: ReactNode }) {
  const { height } = useWindowDimensions()
  return (
    <ScrollView style={{ maxHeight: height * 0.7 }} contentContainerStyle={{ gap: theme.spacing.md, paddingBottom: theme.spacing.sm }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  )
}

export function SheetLabel({ children }: { children: ReactNode }) {
  return <Text style={[shared.label, { marginBottom: 0 }]}>{children}</Text>
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>{children}</View>
}
