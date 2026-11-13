import React from 'react'
import { Switch, View } from 'react-native'
import { Text } from '../ui/Text'
import { shared, theme } from '../../constants'
import type { HostApprovalSectionProps } from '../../types'

/**
 * Its own card right after Price: approval used to be implied by `price > 0`,
 * and the two are now independent (a free event can be screened, a paid one
 * can be open).
 */
export function ApprovalSection({ value, onChange }: HostApprovalSectionProps) {
  return (
    <View style={shared.hostFieldCard}>
      <View style={shared.hostSwitchRow}>
        <View style={{ flex: 1 }}>
          <Text style={shared.hostFieldLabel}>Require approval to join</Text>
          <Text style={shared.caption}>
            {value
              ? 'Players request a spot and you approve each one.'
              : 'Anyone can join instantly until the event is full.'}
          </Text>
        </View>
        <Switch
          testID="event-requires-approval-switch"
          value={value}
          onValueChange={onChange}
          accessibilityLabel="Require approval to join this event"
          trackColor={{ false: theme.colors.border, true: theme.colors.primary + '80' }}
          thumbColor={value ? theme.colors.primary : theme.colors.subtext}
        />
      </View>
    </View>
  )
}
