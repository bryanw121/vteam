import React from 'react'
import { View, ScrollView, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../../ui/Text'
import { theme, shared } from '../../../constants'
import { TOURNAMENT_FORMAT_OPTIONS, formatHasBracket, formatHasPools } from '../../../utils/tournamentDraft'
import { NumericStepper, SectionLabel, Toggle } from './CreateBits'
import type { TournamentBracketType, TournamentStepProps } from '../../../types'

/** Wizard step 2: format, bracket type, pool advancement, refs. */
export function FormatStep({ draft, update }: TournamentStepProps) {
  const hasBracket = formatHasBracket(draft.format)
  const hasPool    = formatHasPools(draft.format)

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
      <SectionLabel icon="grid-outline" label="Tournament Format" />
      <View style={{ gap: 10, marginBottom: 20 }}>
        {TOURNAMENT_FORMAT_OPTIONS.map(opt => {
          const active = draft.format === opt.id
          return (
            <TouchableOpacity
              key={opt.id}
              onPress={() => update({ format: opt.id })}
              activeOpacity={0.8}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 14,
                padding: 16, borderRadius: 20,
                backgroundColor: active ? theme.colors.primarySoft : theme.colors.card,
                borderWidth: 2,
                borderColor: active ? theme.colors.primary : theme.colors.border,
              }}
            >
              <Text style={{ fontSize: theme.font.emoji.xl }}>{opt.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.lgs, color: theme.colors.text }}>{opt.label}</Text>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginTop: 2 }}>{opt.description}</Text>
              </View>
              {active && <Ionicons name="checkmark-circle" size={22} color={theme.colors.primaryText} />}
            </TouchableOpacity>
          )
        })}
      </View>

      {hasBracket && (
        <>
          <SectionLabel icon="git-network-outline" label="Bracket Type" />
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
            {([
              { id: 'single' as TournamentBracketType, icon: '→', label: 'Single Elimination', sub: 'One loss and you\'re out' },
              { id: 'double' as TournamentBracketType, icon: '⇉', label: 'Double Elimination', sub: 'Two losses to be eliminated' },
            ]).map(opt => {
              const active = draft.bracketType === opt.id
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => update({ bracketType: opt.id })}
                  activeOpacity={0.8}
                  style={{
                    flex: 1, padding: 16, borderRadius: 20, alignItems: 'center', gap: 6,
                    backgroundColor: active ? theme.colors.primarySoft : theme.colors.card,
                    borderWidth: 2, borderColor: active ? theme.colors.primary : theme.colors.border,
                  }}
                >
                  <Text style={{ fontSize: theme.font.emoji.lg }}>{opt.icon}</Text>
                  <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.smd, color: theme.colors.text, textAlign: 'center' }}>{opt.label}</Text>
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext, textAlign: 'center' }}>{opt.sub}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </>
      )}

      {hasPool && (
        <>
          <SectionLabel icon="podium-outline" label="Pool Advancement" />
          <View style={[shared.card, { marginBottom: 20 }]}>
            {/* #403: pools can just set the seeds, with every team playing the bracket. */}
            <Toggle
              value={draft.teamsAdvancePerPool === 0}
              onChange={all => update({ teamsAdvancePerPool: all ? 0 : 2 })}
              label="Every team plays the bracket"
              sub="Pool results set the seeds; nobody is out after pools"
            />
            {draft.teamsAdvancePerPool > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>Teams that advance per pool</Text>
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginTop: 2 }}>The top teams of each pool go on</Text>
                </View>
                <NumericStepper value={draft.teamsAdvancePerPool} onChange={v => update({ teamsAdvancePerPool: v })} min={1} max={8} />
              </View>
            )}
          </View>
        </>
      )}

      <SectionLabel icon="flag-outline" label="Officiating" />
      <Toggle
        value={draft.hasRefs}
        onChange={v => update({ hasRefs: v })}
        label="Enable referee rotation"
        sub="3 teams per match slot — 2 playing, 1 reffing"
      />
    </ScrollView>
  )
}
