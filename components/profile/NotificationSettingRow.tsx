import React from 'react'
import { Switch, View } from 'react-native'
import { Text } from '../ui/Text'
import { shared, theme } from '../../constants'
import type { NotificationSettingRowProps } from '../../types'

/** One switch row on Settings → Notifications (label, optional subtitle). */
export function NotificationSettingRow({ label, subtitle, value, disabled, onValueChange, testID }: NotificationSettingRowProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: theme.spacing.sm,
        gap: theme.spacing.md,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={shared.body}>{label}</Text>
        {subtitle ? <Text style={[shared.captionStrong, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      <Switch
        testID={testID}
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.border, true: theme.colors.primary + '88' }}
        thumbColor={value ? theme.colors.primary : theme.colors.card}
      />
    </View>
  )
}
