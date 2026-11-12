import { TouchableOpacity, View } from 'react-native'
import { Text } from './Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme } from '../../constants'
import type { EmptyStateProps } from '../../types'

/** Icon + caption block used when a list has nothing to show (matches the Events feed). */
export function EmptyState({ icon = 'calendar-outline', title, body, actionLabel, onAction, testID }: EmptyStateProps) {
  return (
    <View style={shared.emptyState} testID={testID}>
      <Ionicons name={icon} size={36} color={theme.colors.border} />
      <Text style={shared.caption}>{title}</Text>
      {!!body && <Text style={[shared.caption, shared.emptyStateBody]}>{body}</Text>}
      {!!actionLabel && !!onAction && (
        <TouchableOpacity onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <Text style={shared.emptyStateAction}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}
