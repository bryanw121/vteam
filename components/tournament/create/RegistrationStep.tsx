import React from 'react'
import { View, ScrollView, TouchableOpacity, Platform } from 'react-native'
import { Text, TextInput } from '../../ui/Text'
import { theme, shared } from '../../../constants'
import { Field, NumericStepper, SectionLabel, TextBox } from './CreateBits'
import type { TournamentStepProps } from '../../../types'

/** Wizard step 3: team count, roster size, entry fee and Venmo. */
export function RegistrationStep({ draft, update }: TournamentStepProps) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
      <SectionLabel icon="people-outline" label="Teams" />
      <View style={[shared.card, { marginBottom: 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <View>
            <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>Max teams</Text>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginTop: 2 }}>Leave empty for unlimited</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={() => update({ maxTeams: null })}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: draft.maxTeams === null ? theme.colors.primarySoft : theme.colors.background, borderWidth: 1, borderColor: draft.maxTeams === null ? theme.colors.primary : theme.colors.border }}
            >
              <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.xs, color: draft.maxTeams === null ? theme.colors.primary : theme.colors.subtext }}>∞</Text>
            </TouchableOpacity>
            <NumericStepper
              value={draft.maxTeams ?? 8}
              onChange={v => update({ maxTeams: v })}
              min={2} max={128}
            />
          </View>
        </View>

        <View style={{ height: 1, backgroundColor: theme.colors.border, marginBottom: 16 }} />

        <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.smd, color: theme.colors.subtext, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 }}>Roster size</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>Minimum players</Text>
          <NumericStepper value={draft.minRosterSize} onChange={v => update({ minRosterSize: Math.min(v, draft.maxRosterSize) })} min={1} max={draft.maxRosterSize} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>Maximum players</Text>
          <NumericStepper value={draft.maxRosterSize} onChange={v => update({ maxRosterSize: Math.max(v, draft.minRosterSize) })} min={draft.minRosterSize} max={20} />
        </View>
      </View>

      <SectionLabel icon="cash-outline" label="Fees" />
      <View style={[shared.card, { marginBottom: 16 }]}>
        <Field label="Entry fee per team ($)">
          <TextBox
            value={draft.price === 0 ? '' : String(draft.price)}
            onChangeText={v => update({ price: parseFloat(v) || 0 })}
            placeholder="0 = free"
            keyboardType="decimal-pad"
          />
        </Field>
        {draft.price > 0 && (
          <Field label="Venmo handle (optional)">
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, overflow: 'hidden', backgroundColor: theme.colors.background }}>
              <View style={{ paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.sm + 2, borderRightWidth: 1, borderRightColor: theme.colors.border }}>
                <Text style={{ fontSize: theme.font.size.md, color: theme.colors.subtext, fontWeight: theme.font.weight.medium }}>@</Text>
              </View>
              <TextInput
                value={draft.venmoHandle}
                onChangeText={v => update({ venmoHandle: v.replace(/^@/, '') })}
                placeholder="your-venmo-username"
                placeholderTextColor={theme.colors.subtext}
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  flex: 1,
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: theme.spacing.sm + 2,
                  fontSize: theme.font.size.md,
                  color: theme.colors.text,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                }}
              />
            </View>
          </Field>
        )}
      </View>
    </ScrollView>
  )
}
