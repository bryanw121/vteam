import React from 'react'
import { View, ScrollView } from 'react-native'
import { Text } from '../../ui/Text'
import { theme, shared } from '../../../constants'
import { TIEBREAKER_LABELS } from '../../../constants/tournamentCopy'
import { IconButton } from '../../ui'
import { formatHasBracket, moveItem } from '../../../utils/tournamentDraft'
import { NumericStepper, SectionLabel, Toggle } from './CreateBits'
import type { TournamentDraft, TournamentStepProps } from '../../../types'

/** Wizard step 4: set scoring, match format, point cap, tiebreakers. */
export function RulesStep({ draft, update }: TournamentStepProps) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
      <SectionLabel icon="book-outline" label="Set Scoring" />
      <View style={[shared.card, { marginBottom: 16 }]}>
        {([
          { key: 'startingScore',   label: 'Starting score',          sub: 'e.g. 0 or 4 for a 4-4 start', min: 0, max: 20 },
          { key: 'winningScore',    label: 'Points to win a set',     sub: 'e.g. 25',                     min: 5, max: 50 },
          { key: 'decidingSetScore',label: 'Deciding set target',     sub: 'e.g. 15 for the 5th set',     min: 5, max: 30 },
          { key: 'winByMargin',     label: 'Win-by margin',           sub: 'e.g. 2 (win by 2)',           min: 1, max: 5 },
        ] as { key: keyof TournamentDraft; label: string; sub: string; min: number; max: number }[]).map((row, i, arr) => (
          <View key={row.key}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>{row.label}</Text>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginTop: 2 }}>{row.sub}</Text>
              </View>
              <NumericStepper
                value={draft[row.key] as number}
                onChange={v => update({ [row.key]: v })}
                min={row.min} max={row.max}
              />
            </View>
            {i < arr.length - 1 && <View style={{ height: 1, backgroundColor: theme.colors.border }} />}
          </View>
        ))}
      </View>

      <SectionLabel icon="trophy-outline" label="Match Format" />
      <View style={[shared.card, { marginBottom: 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>Sets to win a match</Text>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginTop: 2 }}>Best of {draft.setsToWin * 2 - 1}</Text>
          </View>
          <NumericStepper value={draft.setsToWin} onChange={v => update({ setsToWin: v })} min={1} max={3} />
        </View>
      </View>

      <SectionLabel icon="remove-circle-outline" label="Point Cap" />
      <View style={[shared.card, { marginBottom: 16 }]}>
        <Toggle
          value={draft.pointCap !== null}
          onChange={v => update({ pointCap: v ? 30 : null })}
          label="Enable point cap"
          sub="Set ends when cap is reached regardless of win-by"
        />
        {draft.pointCap !== null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>Cap at</Text>
            <NumericStepper value={draft.pointCap} onChange={v => update({ pointCap: v })} min={draft.winningScore} max={60} />
          </View>
        )}
      </View>

      <SectionLabel icon="podium-outline" label="Tie Rules" />
      <View style={[shared.card, { marginBottom: 16 }]}>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginBottom: 8 }}>
          Teams rank by wins. When they're level, these break the tie, top first. Teams level on all of them share the place.
        </Text>
        {draft.tiebreakers.map((key, i) => (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 }}>
            <Text style={{ width: 22, fontFamily: theme.fonts.display, fontSize: theme.font.size.md, color: theme.colors.subtext }}>{i + 1}</Text>
            <Text style={{ flex: 1, fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>{TIEBREAKER_LABELS[key]}</Text>
            <IconButton icon="chevron-up" size={44} label={`Move ${TIEBREAKER_LABELS[key]} up`} onPress={() => update({ tiebreakers: moveItem(draft.tiebreakers, i, -1) })} />
            <IconButton icon="chevron-down" size={44} label={`Move ${TIEBREAKER_LABELS[key]} down`} onPress={() => update({ tiebreakers: moveItem(draft.tiebreakers, i, 1) })} />
          </View>
        ))}
        {formatHasBracket(draft.format) && draft.bracketType === 'single' && (
          <View style={{ marginTop: 12 }}>
            <Toggle
              value={draft.thirdPlaceMatch}
              onChange={v => update({ thirdPlaceMatch: v })}
              label="Play a third-place match"
              sub="Off: both semifinal losers share third place"
            />
          </View>
        )}
      </View>
    </ScrollView>
  )
}
