import React from 'react'
import { Platform, Pressable } from 'react-native'
import { Text } from './ui/Text'
import * as Linking from 'expo-linking'
import { theme } from '../constants'
import { venmoNote, venmoPayLinks } from '../utils/venmo'

/** Venmo's brand blue: a third-party colour, so not a theme token. */
const VENMO_BLUE = '#008CFF'

type Props = {
  handle: string
  /** Bare amount string, e.g. "10" or "7.50" (`formatPriceAmount`). */
  amount: string
  /** Event or tournament title; becomes the start of the memo. */
  title: string
  /** Event start (`event_date` / `start_date`); becomes "Sat, Nov 1" in the memo. */
  date: string
  label: string
}

/**
 * "Pay $X via Venmo". Native opens the Venmo app directly and falls back to the
 * web pay page if the app isn't installed; web opens the pay page in a new tab
 * (on a phone, Venmo's universal link hands that to the app).
 */
export function VenmoPayButton({ handle, amount, title, date, label }: Props) {
  const onPress = () => {
    const links = venmoPayLinks(handle, amount, venmoNote(title, date))
    if (Platform.OS === 'web') {
      window.open(links.web, '_blank', 'noopener,noreferrer')
      return
    }
    void Linking.openURL(links.app).catch(() => Linking.openURL(links.web))
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      testID="venmo-pay"
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, minHeight: 48, paddingVertical: 12, paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.md, backgroundColor: VENMO_BLUE,
        opacity: pressed ? 0.85 : hovered ? 0.92 : 1,
        ...(Platform.OS === 'web' ? { cursor: 'pointer', touchAction: 'manipulation' } as object : null),
      })}
    >
      <Text style={{ fontSize: theme.font.emoji.xs }}>💸</Text>
      <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.onPrimary }}>
        {label}
      </Text>
    </Pressable>
  )
}
