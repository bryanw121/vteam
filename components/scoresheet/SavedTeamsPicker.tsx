import { ScrollView, View } from 'react-native'
import { Text } from '../ui/Text'
import { Chip } from '../ui'
import { shared, theme } from '../../constants'
import type { SavedTeamsPickerProps } from '../../types'

/** Teams from earlier matches on this device: one tap puts the team's six and bench back. */
export function SavedTeamsPicker({ teams, target, targetLabel, onPick }: SavedTeamsPickerProps) {
  if (!teams.length || !target) return null
  return (
    <View style={[shared.card, { gap: theme.spacing.sm, marginBottom: theme.spacing.md }]} testID="saved-teams">
      <Text style={shared.label}>Saved teams · tap to fill {targetLabel}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm }}>
        {teams.map(t => (
          <Chip
            key={t.name}
            label={`${t.name} · ${t.court.length + t.bench.length}`}
            variant="tint"
            onPress={() => onPick(t)}
            testID={`saved-team-${t.name}`}
          />
        ))}
      </ScrollView>
      <Text style={shared.caption}>Same starting six and bench as last time. Change anything before you start.</Text>
    </View>
  )
}
