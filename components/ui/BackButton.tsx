import { TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from './Text'
import { IconButton } from './IconButton'
import { shared, theme } from '../../constants'
import type { BackButtonProps } from '../../types'

/**
 * The one Back control (#377): same look and a 44 × 44 pt target on every screen.
 * `row` (default) is the chevron + "Back" row ScreenHeader shows; `pill` is the
 * 44-pt square the event page floats over its cover.
 */
export function BackButton({ onPress, label = 'Back', variant = 'row', testID }: BackButtonProps) {
  if (variant === 'pill') {
    return <IconButton icon="chevron-back" size={44} label={label} onPress={onPress} testID={testID} />
  }
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} style={shared.backRow}>
      <View style={{ width: 24, alignItems: 'center' }}>
        <Ionicons name="chevron-back" size={22} color={theme.colors.primaryText} />
      </View>
      <Text style={shared.screenHeaderBackLabel}>{label}</Text>
    </TouchableOpacity>
  )
}
