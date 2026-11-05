import React from 'react'
import { Platform, View } from 'react-native'
import { Text } from './ui/Text'
import { LocationPickerField } from './LocationPickerField'
import { shared, theme } from '../constants'
import type { LocationValue } from '../types'

type Props = {
  value: LocationValue | null
  onChange: (loc: LocationValue | null) => void
  userId: string | null
}

/**
 * "Home court" on the club create / edit forms (#13): any place from Google
 * Places search, or one of the curated venues as a quick pick. Optional.
 */
export function ClubLocationField({ value, onChange, userId }: Props) {
  return (
    <View style={shared.inputContainer} testID="club-location-field">
      <Text style={shared.label}>Home court (optional)</Text>
      <LocationPickerField
        value={value}
        onChange={loc => onChange(loc.display ? loc : null)}
        userId={userId}
        placeholder="Search any gym, park or address"
        hideOtherVenue
        triggerStyle={{
          marginTop: 0, minHeight: 48,
          paddingHorizontal: theme.spacing.md, paddingVertical: 12,
          backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md,
          ...(Platform.OS === 'web' ? { cursor: 'pointer', touchAction: 'manipulation' } as object : null),
        }}
      />
      <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext, marginTop: theme.spacing.xs }} numberOfLines={2}>
        {value?.address ?? 'Where the club usually plays. Shown on the club page with a map link.'}
      </Text>
    </View>
  )
}
