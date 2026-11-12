import { View } from 'react-native'
import { Text } from './Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme } from '../../constants'

type Props = { label: string; size?: 'md' | 'lg'; accessibilityLabel?: string; testID?: string }

/** Event start time in its own high-contrast pill, so the time is the first thing a player reads. */
export function TimePill({ label, size = 'md', accessibilityLabel, testID }: Props) {
  const lg = size === 'lg'
  return (
    <View testID={testID} accessibilityLabel={accessibilityLabel ?? `Starts at ${label}`} style={shared.timePill}>
      <Ionicons name="time" size={lg ? 17 : 15} color={theme.colors.timeInk} />
      <Text style={[shared.timePillLabel, lg && shared.timePillLabelLg]}>{label}</Text>
    </View>
  )
}
