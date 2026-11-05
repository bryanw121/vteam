import React from 'react'
import { Platform, Pressable, View } from 'react-native'
import { Text } from './ui/Text'
import * as Linking from 'expo-linking'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme } from '../constants'
import { clubMapsUrl } from '../utils/clubLocation'
import type { ClubLocationFields } from '../types'

type Props = {
  club: ClubLocationFields
}

/** The club's home court on the club page (#13): name, address, and a tap through to maps. */
export function ClubLocationCard({ club }: Props) {
  const url = clubMapsUrl(club)
  if (!club.location_name) return null
  const open = () => {
    if (!url) return
    if (Platform.OS === 'web') window.open(url, '_blank', 'noopener,noreferrer')
    else void Linking.openURL(url)
  }
  return (
    <Pressable
      testID="club-location-card"
      onPress={open}
      disabled={!url}
      accessibilityRole="link"
      accessibilityLabel={`Home court: ${club.location_name}${club.location_address ? `, ${club.location_address}` : ''}. Open in maps`}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        shared.card,
        {
          marginBottom: theme.spacing.md, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56,
          opacity: pressed ? 0.85 : 1,
          borderColor: hovered ? theme.colors.primary + '66' : theme.colors.border,
        },
        Platform.OS === 'web' ? ({ cursor: 'pointer', touchAction: 'manipulation' } as object) : null,
      ]}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="location" size={20} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.semibold, color: theme.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Home court
        </Text>
        <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.text }} numberOfLines={1}>
          {club.location_name}
        </Text>
        {club.location_address ? (
          <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }} numberOfLines={2}>
            {club.location_address}
          </Text>
        ) : null}
        <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.primary, marginTop: 4, fontWeight: theme.font.weight.semibold }}>
          Open in Maps →
        </Text>
      </View>
    </Pressable>
  )
}
