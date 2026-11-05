import React from 'react'
import { TouchableOpacity } from 'react-native'
import { Text } from '../ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme } from '../../constants'

type Props = { onPress: () => void }

/** Under the Tournament filter: the full list, including past tournaments and their podiums. */
export function AllTournamentsLink({ onPress }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="link"
      testID="all-tournaments-link"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: theme.spacing.md }}
    >
      <Ionicons name="trophy-outline" size={16} color={theme.colors.primary} />
      <Text style={{ flex: 1, fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.smd, color: theme.colors.primary }}>
        All tournaments, upcoming and past
      </Text>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
    </TouchableOpacity>
  )
}
