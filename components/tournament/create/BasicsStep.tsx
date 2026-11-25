import React from 'react'
import { View, ScrollView, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../../ui/Text'
import { theme, shared, SKILL_LEVEL_LABELS } from '../../../constants'
import { TOURNAMENT_CLUBS_ERROR } from '../../../constants/tournamentCopy'
import { DatePickerField } from '../../DatePickerField'
import { Button } from '../../Button'
import { Spinner } from '../../ui/Spinner'
import { Field, SectionLabel, TextBox } from './CreateBits'
import type { TournamentBasicsStepProps } from '../../../types'

/** Wizard step 1: name, description, club, skill levels, when and where. */
export function BasicsStep({ draft, update, clubs, clubsLoading, clubsError, onRetryClubs }: TournamentBasicsStepProps) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 0 }} showsVerticalScrollIndicator={false}>
      <SectionLabel icon="trophy-outline" label="Tournament Info" />
      <View style={[shared.card, { marginBottom: 16 }]}>
        <Field label="Tournament name">
          <TextBox value={draft.title} onChangeText={v => update({ title: v })} placeholder="e.g. Summer Slam 2026" />
        </Field>
        <Field label="Description">
          <TextBox value={draft.description} onChangeText={v => update({ description: v })} placeholder="What should players know?" multiline />
        </Field>
      </View>

      <SectionLabel icon="people-outline" label="Club" />
      <View style={[shared.card, { marginBottom: 16 }]}>
        <Field label="Associate with club">
          {clubsLoading && clubs.length === 0
            ? <Spinner label="Loading your clubs" />
            : clubsError
            ? <View style={{ gap: 8, alignItems: 'flex-start' }}>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.subtext }}>{TOURNAMENT_CLUBS_ERROR}</Text>
                <Button label="Try again" variant="secondary" onPress={onRetryClubs} />
              </View>
            : clubs.length === 0
            ? <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.subtext }}>You must be a club member to host a tournament.</Text>
            : <View style={{ gap: 8 }}>
                {clubs.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => update({ clubId: c.id })}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      padding: 12, borderRadius: 12,
                      backgroundColor: draft.clubId === c.id ? theme.colors.primarySoft : theme.colors.background,
                      borderWidth: 1.5,
                      borderColor: draft.clubId === c.id ? theme.colors.primary : theme.colors.border,
                    }}
                  >
                    <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>{c.name}</Text>
                    {draft.clubId === c.id && <Ionicons name="checkmark-circle" size={18} color={theme.colors.primaryText} />}
                  </TouchableOpacity>
                ))}
              </View>
          }
        </Field>
      </View>

      <SectionLabel icon="stats-chart-outline" label="Skill Level" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {Object.entries(SKILL_LEVEL_LABELS).map(([id, label]) => ({ id: id as (typeof draft.skillLevels)[number], label })).map(opt => {
          const active = draft.skillLevels.includes(opt.id)
          return (
            <TouchableOpacity
              key={opt.id}
              onPress={() => update({
                skillLevels: active
                  ? draft.skillLevels.filter(l => l !== opt.id)
                  : [...draft.skillLevels, opt.id],
              })}
              activeOpacity={0.75}
              style={{
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
                backgroundColor: active ? theme.colors.primarySoft : theme.colors.card,
                borderWidth: 1.5,
                borderColor: active ? theme.colors.primary : theme.colors.border,
              }}
            >
              <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.base, color: active ? theme.colors.primaryText : theme.colors.text }}>{opt.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <SectionLabel icon="location-outline" label="When & Where" />
      <View style={[shared.card, { marginBottom: 16 }]}>
        <Field label="Location">
          <TextBox value={draft.location} onChangeText={v => update({ location: v })} placeholder="Gym name, address…" />
        </Field>
        <Field label="Start date & time">
          <DatePickerField
            value={draft.startDate}
            onChange={d => update({ startDate: d })}
            placeholder="Pick a date"
          />
        </Field>
        <Field label="Registration deadline">
          <DatePickerField
            value={draft.registrationDeadline}
            onChange={d => update({ registrationDeadline: d })}
            placeholder="Optional"
          />
        </Field>
      </View>
    </ScrollView>
  )
}
