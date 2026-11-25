import React from 'react'
import { View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { HOSTED_ON_VTEAM, shared, theme } from '../../constants'

/** "Hosted on vteam" on feed cards for games and tournaments made in vteam. */
export function HostedBadge() {
  return (
    <View style={shared.ecHostedBadge} testID="hosted-on-vteam" accessibilityLabel={HOSTED_ON_VTEAM}>
      <Ionicons name="sparkles" size={11} color={theme.colors.onPrimary} />
      <Text style={shared.ecHostedBadgeText}>{HOSTED_ON_VTEAM}</Text>
    </View>
  )
}
