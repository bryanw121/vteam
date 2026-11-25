import React from 'react'
import { View } from 'react-native'
import { Text } from '../ui/Text'
import { HOSTED_ON_VTEAM, shared } from '../../constants'

/** "Hosted on vteam" on feed cards for games and tournaments made in vteam. */
export function HostedBadge() {
  return (
    <View style={shared.ecHostedBadge} testID="hosted-on-vteam" accessibilityLabel={HOSTED_ON_VTEAM}>
      <Text style={shared.ecHostedBadgeText}>{HOSTED_ON_VTEAM}</Text>
    </View>
  )
}
