import React from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { shared, theme } from '../../constants'
import type { HostClubSectionProps } from '../../types'

/** A club the host owns, attached to the event (tap again to clear). Hidden when they own none. */
export function ClubSection({ clubs, selectedClubId, onSelect }: HostClubSectionProps) {
  if (clubs.length === 0) return null
  return (
    <View style={shared.hostFieldCard}>
      <Text style={shared.hostFieldLabel}>Club (optional)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {clubs.map(club => {
          const active = selectedClubId === club.id
          return (
            <TouchableOpacity
              key={club.id}
              onPress={() => onSelect(active ? null : club.id)}
              style={{
                paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999,
                backgroundColor: active ? theme.colors.primary : theme.colors.border,
              }}
            >
              <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.smd, color: active ? theme.colors.white : theme.colors.text }}>
                {club.name}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}
