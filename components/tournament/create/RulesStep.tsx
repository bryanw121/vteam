import React, { useState } from 'react'
import { View, ScrollView } from 'react-native'
import { Text } from '../../ui/Text'
import { theme, shared } from '../../../constants'
import { TIEBREAKER_LABELS } from '../../../constants/tournamentCopy'
import { Chip, IconButton } from '../../ui'
import { formatHasBracket, moveItem } from '../../../utils/tournamentDraft'
import { baseScoring, describeScoring, phasesFor, type PhaseTab } from '../../../utils/tournamentPhases'
import { NumericStepper, SectionLabel, Toggle } from './CreateBits'
import type { PhaseScoring, TournamentPhase, TournamentStepProps } from '../../../types'

const STEPPERS: { key: keyof PhaseScoring; label: string; sub: string; min: number; max: number }[] = [
  { key: 'startingScore',    label: 'Starting score',      sub: 'e.g. 0, or 4 for a 4–4 start', min: 0, max: 20 },
  { key: 'winningScore',     label: 'Points to win a set', sub: 'e.g. 25',                     min: 5, max: 50 },
  { key: 'decidingSetScore', label: 'Deciding set to',     sub: 'e.g. 15',                     min: 5, max: 30 },
  { key: 'winByMargin',      label: 'Win by',              sub: '2, or 1 for next point wins', min: 1, max: 5 },
]

/** One phase's scoring: start, target, deciding set, win by, sets and cap. */
function ScoringFields({ value, onChange, disabled }: { value: PhaseScoring; onChange: (next: PhaseScoring) => void; disabled?: boolean }) {
  const set = (patch: Partial<PhaseScoring>) => onChange({ ...value, ...patch })
  return (
    <View style={disabled ? { opacity: 0.5 } : undefined} pointerEvents={disabled ? 'none' : 'auto'}>
      {STEPPERS.map(row => (
        <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>{row.label}</Text>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginTop: 2 }}>{row.sub}</Text>
          </View>
          <NumericStepper value={value[row.key] as number} onChange={v => set({ [row.key]: v })} min={row.min} max={row.max} />
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>Sets to win a match</Text>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginTop: 2 }}>{value.setsToWin === 1 ? 'One set' : `Best of ${value.setsToWin * 2 - 1}`}</Text>
        </View>
        <NumericStepper value={value.setsToWin} onChange={v => set({ setsToWin: v })} min={1} max={3} />
      </View>
      <View style={{ paddingTop: 10 }}>
        <Toggle
          value={value.pointCap !== null}
          onChange={v => set({ pointCap: v ? Math.max(value.winningScore + 2, 27) : null })}
          label="Point cap"
          sub="The set ends at the cap, whatever the margin"
        />
        {value.pointCap !== null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>Cap at</Text>
            <NumericStepper value={value.pointCap} onChange={v => set({ pointCap: v })} min={value.winningScore} max={60} />
          </View>
        )}
      </View>
    </View>
  )
}

/** Wizard step 4: scoring per phase (pool play, bracket, losers bracket, final; #404), tiebreakers. */
export function RulesStep({ draft, update }: TournamentStepProps) {
  const tabs = phasesFor(draft.format, formatHasBracket(draft.format) ? draft.bracketType : null)
  const [tabKey, setTabKey] = useState<PhaseTab['key']>('base')
  const tab = tabs.find(t => t.key === tabKey) ?? tabs[0]
  const base = baseScoring(draft)
  const custom = tab.key === 'base' ? null : draft.phaseRules[tab.key] ?? null

  function setPhase(key: TournamentPhase, value: PhaseScoring | null) {
    const next = { ...draft.phaseRules }
    if (value) next[key] = value
    else delete next[key]
    update({ phaseRules: next })
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
      <SectionLabel icon="book-outline" label="Scoring" />
      {tabs.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }} role="tablist">
          {tabs.map(t => (
            <Chip
              key={t.key}
              label={t.label}
              active={t.key === tab.key}
              onPress={() => setTabKey(t.key)}
              testID={`rules-phase-${t.key}`}
            />
          ))}
        </View>
      )}
      <View style={[shared.card, { marginBottom: 16 }]}>
        {tab.key === 'base' ? (
          <ScoringFields value={base} onChange={v => update(v)} />
        ) : (
          <>
            <Toggle
              value={!custom}
              onChange={same => setPhase(tab.key as TournamentPhase, same ? null : base)}
              label={`Same as ${tabs[0].label.toLowerCase()}`}
              sub={custom ? `${tab.label} has its own rules` : describeScoring(base)}
            />
            {custom && (
              <View style={{ marginTop: 8 }}>
                <ScoringFields value={custom} onChange={v => setPhase(tab.key as TournamentPhase, v)} />
              </View>
            )}
          </>
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
