import React from 'react'
import { TouchableOpacity } from 'react-native'
import { Text } from '../ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme } from '../../constants'

type Props = { count: number; onPress: () => void }

/** Under the feed filters: leagues around town open for sign-up (Schelagg's programs feed). */
export function LeaguesLink({ count, onPress }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${count} league${count === 1 ? '' : 's'} open for sign-up`}
      testID="leagues-link"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: theme.spacing.md }}
    >
      <Ionicons name="calendar-outline" size={16} color={theme.colors.primaryText} />
      <Text style={{ flex: 1, fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.smd, color: theme.colors.primaryText }}>
        Leagues open for sign-up · {count}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.primaryText} />
    </TouchableOpacity>
  )
}
