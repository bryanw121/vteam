import React from 'react'
import { Switch, View } from 'react-native'
import { Text, TextInput } from '../ui/Text'
import { shared, theme } from '../../constants'
import type { HostSaveTemplateSectionProps } from '../../types'

/** Save as template (create only), with an optional name. */
export function SaveTemplateSection({ enabled, onToggle, name, onChangeName, placeholder }: HostSaveTemplateSectionProps) {
  return (
    <View style={shared.hostFieldCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={shared.hostFieldLabel}>Save as template</Text>
        <Switch
          accessibilityLabel="Save as template"
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: theme.colors.border, true: theme.colors.primary + '80' }}
          thumbColor={enabled ? theme.colors.primary : theme.colors.subtext}
        />
      </View>
      {enabled && (
        <TextInput
          value={name}
          onChangeText={onChangeName}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.subtext}
          style={[shared.hostFieldInput, { marginTop: 10 }]}
        />
      )}
    </View>
  )
}
