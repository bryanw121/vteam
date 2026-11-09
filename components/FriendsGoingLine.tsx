import { View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from './ui/Text'
import { theme } from '../constants'
import { friendsGoingLabel } from '../utils/friends'
import type { FriendsGoingLineProps } from '../types'

/** "Ana and 2 friends going" (#15), best friends first. Renders nothing when no friends are going. */
export function FriendsGoingLine({ going, tone = 'onCard', testID = 'friends-going' }: FriendsGoingLineProps) {
  const label = friendsGoingLabel(going)
  if (!label) return null
  const hasBest = going?.some(g => g.is_best_friend) ?? false
  const color = tone === 'onDark' ? theme.colors.accent : theme.colors.primary
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }} testID={testID} accessibilityLabel={label}>
      <Ionicons name={hasBest ? 'star' : 'people'} size={12} color={color} />
      <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm, color }}>
        {label}
      </Text>
    </View>
  )
}
