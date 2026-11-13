import { View } from 'react-native'
import { Text } from './ui/Text'
import { shared } from '../constants'
import { cheerChips } from '../utils/notificationGroups'
import type { NotificationData } from '../types'

/** Cheer types on a grouped cheers notification (#194): "Pass ×2", "Spike". Nothing for other rows. */
export function NotificationCheerChips({ data }: { data: NotificationData | null | undefined }) {
  const chips = cheerChips(data?.cheer_counts)
  if (chips.length === 0) return null
  return (
    <View style={shared.notificationChips} testID="notification-cheer-chips">
      {chips.map(label => <Text key={label} style={shared.notificationChip}>{label}</Text>)}
    </View>
  )
}
