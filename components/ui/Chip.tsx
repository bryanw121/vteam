import { TouchableOpacity, View } from 'react-native'
import { Text } from './Text'
import { shared } from '../../constants'
import { hitV } from '../../utils/hitArea'
import type { ChipProps } from '../../types'

const CHIP_HIT = hitV(32)

/** Pill filter chip. `solid` fills with primary when active (feed); `tint` uses a 14% wash (clubs-style). */
export function Chip({ label, active = false, onPress, badge, variant = 'solid', role = 'button', size = 'default', testID }: ChipProps) {
  const tint = variant === 'tint'
  const hasBadge = badge !== undefined && badge !== null && badge !== ''
  // react-native-web ignores accessibilityState, so a radio chip states its
  // choice with role + aria-checked (read by both web and native).
  const a11y = role === 'radio'
    ? { role: 'radio' as const, 'aria-checked': active }
    : { accessibilityRole: 'button' as const, accessibilityState: { selected: active } }
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      {...a11y}
      // 44-pt tap target around the 32-pt pill (#386); the pill is the child, so it looks the same.
      style={size === 'touch' ? undefined : CHIP_HIT}
    >
      <View style={[shared.chip, size === 'touch' && shared.chipTouch, active && (tint ? shared.chipActiveTint : shared.chipActive)]}>
        <Text style={[shared.chipLabel, active && (tint ? shared.chipLabelActiveTint : shared.chipLabelActive)]}>
          {hasBadge ? `${label} ${badge}` : label}
        </Text>
      </View>
    </TouchableOpacity>
  )
}
