import { TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme } from '../../constants'
import type { IconButtonProps } from '../../types'
import { Spinner } from './Spinner'

/** Square bordered icon button (the notifications bell). 38pt by default; use 44 where touch targets matter. */
export function IconButton({ icon, onPress, label, size = 38, active, badge, busy, testID }: IconButtonProps) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active === undefined && !busy ? undefined : { selected: active, busy }}
      style={[shared.iconButton, { width: size, height: size }]}
    >
      <View>
        {busy
          ? <Spinner size="small" color={theme.colors.text} />
          : (
            <Ionicons
              name={icon}
              size={size === 44 ? 20 : 18}
              color={active ? theme.colors.primary : theme.colors.text}
            />
          )}
        {!!badge && <View style={shared.iconButtonDot} testID={testID ? `${testID}-badge` : undefined} />}
      </View>
    </TouchableOpacity>
  )
}
