import React from 'react'
import { Platform, Pressable, View } from 'react-native'
import { Text } from '../ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme } from '../../constants'

type Props = {
  paid: boolean
  saving: boolean
  onChange: (paid: boolean) => void
}

/**
 * "I've paid" self-toggle on a paid event (#6). A checkbox row, 48pt tall, that
 * the attendee taps to tell the host they've paid. Only the attendee and the
 * event's hosts can see the flag.
 */
export function PaidToggle({ paid, saving, onChange }: Props) {
  return (
    <Pressable
      testID="paid-toggle"
      accessibilityRole="checkbox"
      // aria-* rather than accessibilityState: react-native-web only emits aria-checked from these.
      aria-checked={paid}
      aria-busy={saving}
      accessibilityLabel="I've paid"
      accessibilityHint="Lets the host know you've paid. Only you and the hosts see this."
      onPress={() => onChange(!paid)}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12,
        minHeight: 48, marginTop: theme.spacing.sm, paddingVertical: 10, paddingHorizontal: 14,
        borderRadius: theme.radius.md, borderWidth: 1,
        borderColor: paid ? theme.colors.success + '66' : theme.colors.border,
        backgroundColor: paid ? theme.colors.success + '14' : hovered || pressed ? theme.colors.background : 'transparent',
        ...(Platform.OS === 'web' ? { cursor: 'pointer', touchAction: 'manipulation' } as object : null),
      })}
    >
      <Ionicons
        name={paid ? 'checkbox' : 'square-outline'}
        size={24}
        color={paid ? theme.colors.success : theme.colors.subtext}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
          I've paid
        </Text>
        <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext, marginTop: 2 }}>
          {paid ? 'The host can see you marked this paid.' : 'Tap after you pay so the host knows.'}
        </Text>
      </View>
    </Pressable>
  )
}
