import React from 'react'
import { View, ScrollView, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../../ui/Text'
import { theme, shared, SKILL_LEVEL_LABELS } from '../../../constants'
import { TOURNAMENT_CLUBS_ERROR, TOURNAMENT_CLUBS_LINKED_HINT, TOURNAMENT_CLUBS_OPEN_HINT } from '../../../constants/tournamentCopy'
import { isClubRunner } from '../../../utils/tournamentDraft'
import { DatePickerField } from '../../DatePickerField'
import { LocationPickerField } from '../../LocationPickerField'
import { useSession } from '../../../contexts/session'
import { Button } from '../../Button'
import { Spinner } from '../../ui/Spinner'
import { Field, SectionLabel, TextBox } from './CreateBits'
import type { TournamentBasicsStepProps } from '../../../types'

/** Wizard step 1: name, description, linked clubs (optional, #401), skill levels, when and where. */
export function BasicsStep({ draft, update, clubs, clubsLoading, clubsError, onRetryClubs }: TournamentBasicsStepProps) {
  const { userId } = useSession()
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

      <SectionLabel icon="people-outline" label="Clubs (optional)" />
      <View style={[shared.card, { marginBottom: 16 }]}>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.subtext, marginBottom: 10 }}>
          {draft.clubIds.length ? TOURNAMENT_CLUBS_LINKED_HINT : TOURNAMENT_CLUBS_OPEN_HINT}
        </Text>
        {clubsLoading && clubs.length === 0
          ? <Spinner label="Loading your clubs" />
          : clubsError
          ? <View style={{ gap: 8, alignItems: 'flex-start' }}>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.subtext }}>{TOURNAMENT_CLUBS_ERROR}</Text>
              <Button label="Try again" variant="secondary" onPress={onRetryClubs} />
            </View>
          : clubs.length > 0 && (
            <View style={{ gap: 8 }}>
              {clubs.map(c => {
                const on = draft.clubIds.includes(c.id)
                return (
                  <TouchableOpacity
                    key={c.id}
                    testID="tournament-club-option"
                    role="checkbox"
                    aria-checked={on}
                    onPress={() => update({ clubIds: on ? draft.clubIds.filter(id => id !== c.id) : [...draft.clubIds, c.id] })}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44,
                      paddingHorizontal: 12, paddingVertical: 10, borderRadius: theme.radius.md,
                      backgroundColor: on ? theme.colors.primarySoft : theme.colors.background,
                      borderWidth: 1.5,
                      borderColor: on ? theme.colors.primary : theme.colors.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>{c.name}</Text>
                      {isClubRunner(c.role) && (
                        <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext }}>You run it</Text>
                      )}
                    </View>
                    <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={on ? theme.colors.primaryText : theme.colors.subtext} />
                  </TouchableOpacity>
                )
              })}
            </View>
          )
        }
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
          {/* Google place search with matches as you type, like the event host form (#401). Tournaments keep the name only. */}
          <LocationPickerField
            value={draft.location ? { display: draft.location, latitude: null, longitude: null } : null}
            onChange={loc => update({ location: loc.display })}
            userId={userId}
            placeholder="Gym name, address…"
          />
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
