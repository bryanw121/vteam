import { View } from 'react-native'
import { Text } from './Text'
import { BackButton } from './BackButton'
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
        <View style={shared.screenHeaderBack}>
          <BackButton onPress={onBack} label={backLabel} testID="screen-header-back" />
        </View>
      )}
      <View style={shared.screenHeader}>
        <View style={shared.screenHeaderText}>
          {!!kicker && <Text style={shared.screenHeaderKicker}>{kicker}</Text>}
          <Text style={shared.screenHeaderTitle} accessibilityRole="header" numberOfLines={1} testID="screen-title">
            {title}
            {titleDot && <Text style={{ color: theme.colors.primaryText }}>.</Text>}
          </Text>
        </View>
        {!!right && <View style={shared.screenHeaderRight}>{right}</View>}
      </View>
    </View>
  )
}
