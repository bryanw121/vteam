import React from 'react'
import { Switch, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { shared, theme } from '../../constants'
import type { NotificationSettingRowProps } from '../../types'

/**
 * One switch row on Settings → Notifications (label, optional subtitle, optional icon tile).
 * The switch is a solid purple track with a white knob when on (Party invite layout).
 */
export function NotificationSettingRow({ label, subtitle, value, disabled, onValueChange, testID, icon, iconColor = theme.colors.primaryText }: NotificationSettingRowProps) {
  return (
    <View style={shared.settingRow}>
      {icon ? (
        <View style={[shared.settingRowIcon, { backgroundColor: iconColor + '1F' }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={shared.settingRowLabel}>{label}</Text>
        {subtitle ? <Text style={[shared.captionStrong, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      <Switch
        testID={testID}
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
        thumbColor={theme.colors.white}
        // react-native-web colours the knob of an on switch teal (`activeThumbColor`) unless told otherwise.
        {...({ activeThumbColor: theme.colors.white } as object)}
      />
    </View>
  )
}
