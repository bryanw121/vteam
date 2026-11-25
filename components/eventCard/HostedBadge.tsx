import React from 'react'
import { View } from 'react-native'
import { Text } from '../ui/Text'
import { HOSTED_ON_VTEAM, shared } from '../../constants'

type Props = { /** On a card's colour-block cover: a white chip with purple text. */ onCover?: boolean }

/** "Hosted on vteam" on feed cards for games and tournaments made in vteam. */
export function HostedBadge({ onCover = false }: Props) {
  return (
    <View style={onCover ? shared.ecHostedBadgeOnCover : shared.ecHostedBadge} testID="hosted-on-vteam" accessibilityLabel={HOSTED_ON_VTEAM}>
      <Text style={onCover ? shared.ecHostedBadgeOnCoverText : shared.ecHostedBadgeText}>{HOSTED_ON_VTEAM}</Text>
    </View>
  )
}
