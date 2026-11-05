import { TouchableOpacity, View } from 'react-native'
import { Text } from './Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { shared, theme } from '../../constants'
import type { ScreenHeaderProps } from '../../types'

/**
 * Large page header: uppercase kicker, 34px display title, optional right slot,
 * optional back row. Set `safeTop` when the screen has no native header above it.
 */
export function ScreenHeader({ kicker, title, titleDot, right, onBack, backLabel = 'Back', safeTop }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets()
  return (
    <View style={{ paddingTop: safeTop ? insets.top : 0 }}>
      {onBack && (
        <TouchableOpacity
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          testID="screen-header-back"
          style={shared.screenHeaderBack}
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
          <Text style={shared.screenHeaderBackLabel}>{backLabel}</Text>
        </TouchableOpacity>
      )}
      <View style={shared.screenHeader}>
        <View style={shared.screenHeaderText}>
          {!!kicker && <Text style={shared.screenHeaderKicker}>{kicker}</Text>}
          <Text style={shared.screenHeaderTitle} accessibilityRole="header" numberOfLines={1}>
            {title}
            {titleDot && <Text style={{ color: theme.colors.primary }}>.</Text>}
          </Text>
        </View>
        {!!right && <View style={shared.screenHeaderRight}>{right}</View>}
      </View>
    </View>
  )
}
