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
export function ScreenHeader({ kicker, title, titleDot, right, onBack, backLabel = 'Back', safeTop, compact }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets()
  if (compact) {
    // One row (Settings, Party invite layout): the 44-pt Back pill, the title centred, the right slot or a spacer the pill's size.
    return (
      <View style={[shared.screenHeaderCompact, { paddingTop: (safeTop ? insets.top : 0) + theme.spacing.sm }]}>
        {onBack ? <BackButton onPress={onBack} label={backLabel} variant="pill" testID="screen-header-back" /> : <View style={shared.screenHeaderCompactSide} />}
        <Text style={shared.screenHeaderCompactTitle} accessibilityRole="header" numberOfLines={1} testID="screen-title">{title}</Text>
        {right ? <View style={shared.screenHeaderCompactSide}>{right}</View> : <View style={shared.screenHeaderCompactSide} />}
      </View>
    )
  }
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
