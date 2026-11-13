import React from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { shared, theme } from '../../constants'
import type { YourGameCardProps } from '../../types'

/** "Your game" (#227): the viewer's points, cheers and games this year on a game they played. */
export function YourGameCard({ points, pointsLine, cheers, gamesThisYear, onShare, sharing }: YourGameCardProps) {
  return (
    <View style={[shared.card, { marginBottom: theme.spacing.md }]} testID="your-game-card">
      <Text style={shared.subheading}>Your game</Text>
      <View style={shared.recapStats}>
        <View style={shared.recapStat}>
          <Text style={shared.recapStatValue}>+{points}</Text>
          <Text style={shared.caption}>points</Text>
        </View>
        <View style={shared.recapStat}>
          <Text style={shared.recapStatValue}>{cheers}</Text>
          <Text style={shared.caption}>{cheers === 1 ? 'cheer' : 'cheers'}</Text>
        </View>
        <View style={shared.recapStat}>
          <Text style={shared.recapStatValue}>{gamesThisYear}</Text>
          <Text style={shared.caption}>{gamesThisYear === 1 ? 'game this year' : 'games this year'}</Text>
        </View>
      </View>
      <Text style={[shared.caption, { marginTop: theme.spacing.sm }]}>{pointsLine}</Text>
      <TouchableOpacity onPress={onShare} disabled={sharing} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }} accessibilityRole="button">
        <Text style={shared.emptyStateAction}>{sharing ? 'Getting your picture…' : 'Share a picture of it'}</Text>
      </TouchableOpacity>
    </View>
  )
}
