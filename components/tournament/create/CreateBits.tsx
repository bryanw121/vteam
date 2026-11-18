import React from 'react'
import { View, TouchableOpacity, Platform } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text, TextInput } from '../../ui/Text'
import { theme } from '../../../constants'
import { TOURNAMENT_STEP_LABELS } from '../../../utils/tournamentDraft'
import type {
  WizardFieldProps, WizardPreviewRowProps, WizardSectionLabelProps, WizardStepIndicatorProps, WizardStepperProps,
  WizardTextBoxProps, WizardToggleProps,
} from '../../../types'

/** The tournament wizard's small form pieces (#325): steps, labels, fields, steppers, toggles. */

export function StepIndicator({ current }: WizardStepIndicatorProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 0 }}>
      {TOURNAMENT_STEP_LABELS.map((label, i) => {
        const done    = i < current
        const active  = i === current
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <View style={{ height: 1, width: 24, backgroundColor: done ? theme.colors.primary : theme.colors.border }} />
            )}
            <View style={{ alignItems: 'center', gap: 4 }}>
              <View style={{
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: active ? theme.colors.primary : done ? theme.colors.primarySoft : theme.colors.card,
                borderWidth: active || done ? 0 : 1,
                borderColor: theme.colors.border,
                alignItems: 'center', justifyContent: 'center',
              }}>
                {done
                  ? <Ionicons name="checkmark" size={14} color={theme.colors.primary} />
                  : <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.xs, color: active ? theme.colors.onPrimary : theme.colors.subtext }}>{i + 1}</Text>
                }
              </View>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: active ? theme.colors.primary : theme.colors.subtext, letterSpacing: 0.3 }}>
                {label}
              </Text>
            </View>
          </React.Fragment>
        )
      })}
    </View>
  )
}

export function SectionLabel({ icon, label }: WizardSectionLabelProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, marginTop: 6 }}>
      <Ionicons name={icon} size={13} color={theme.colors.subtext} />
      <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, letterSpacing: 1, textTransform: 'uppercase', color: theme.colors.subtext }}>
        {label}
      </Text>
    </View>
  )
}

export function Field({ label, children }: WizardFieldProps) {
  return (
    <View style={{ marginBottom: theme.spacing.md }}>
      <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  )
}

export function TextBox({ value, onChangeText, placeholder, multiline, keyboardType, style }: WizardTextBoxProps) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.subtext}
      multiline={multiline}
      keyboardType={keyboardType ?? 'default'}
      style={[{
        backgroundColor: theme.colors.card,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        paddingHorizontal: 14,
        paddingVertical: 11,
        fontFamily: theme.fonts.body,
        fontSize: theme.font.size.md,
        color: theme.colors.text,
        minHeight: multiline ? 80 : undefined,
        textAlignVertical: multiline ? 'top' : undefined,
        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
      }, style]}
    />
  )
}

export function NumericStepper({ value, onChange, min = 0, max = 99 }: WizardStepperProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
      <TouchableOpacity
        onPress={() => onChange(Math.max(min, value - 1))}
        style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="remove" size={16} color={theme.colors.text} />
      </TouchableOpacity>
      <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.lg, color: theme.colors.text, minWidth: 40, textAlign: 'center' }}>{value}</Text>
      <TouchableOpacity
        onPress={() => onChange(Math.min(max, value + 1))}
        style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="add" size={16} color={theme.colors.text} />
      </TouchableOpacity>
    </View>
  )
}

export function Toggle({ value, onChange, label, sub }: WizardToggleProps) {
  return (
    <TouchableOpacity
      onPress={() => onChange(!value)}
      activeOpacity={0.8}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 10 }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>{label}</Text>
        {sub && <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginTop: 2 }}>{sub}</Text>}
      </View>
      <View style={{
        width: 44, height: 26, borderRadius: 13,
        backgroundColor: value ? theme.colors.primary : theme.colors.border,
        justifyContent: 'center', paddingHorizontal: 3,
      }}>
        <View style={{
          width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.white,
          transform: [{ translateX: value ? 18 : 0 }],
        }} />
      </View>
    </TouchableOpacity>
  )
}

export function PreviewRow({ icon, label, value }: WizardPreviewRowProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <Ionicons name={icon} size={16} color={theme.colors.subtext} />
      <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.subtext, width: 110 }}>{label}</Text>
      <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.smd, color: theme.colors.text, flex: 1 }}>{value}</Text>
    </View>
  )
}
