import React from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import { SCHEDULE_OPTIONS } from '../../constants/tournamentCopy'
import { Button } from '../Button'
import type { ScheduleConfig, TournamentFormat } from '../../types'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: theme.font.size.smd, fontWeight: '600', color: theme.colors.text }}>{label}</Text>
      {children}
    </View>
  )
}

function Choices<T extends number | null>({ options, value, onSelect, labelFor, padding = 12, wrap }: {
  options: readonly T[]
  value: T
  onSelect: (v: T) => void
  labelFor?: (v: T) => string
  padding?: number
  wrap?: boolean
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: wrap ? 'wrap' : 'nowrap' }}>
      {options.map(n => {
        const active = value === n
        return (
          <TouchableOpacity
            key={String(n)}
            onPress={() => onSelect(n)}
            accessibilityState={{ selected: active }}
            style={{ paddingHorizontal: padding, paddingVertical: 8, borderRadius: 8, backgroundColor: active ? theme.colors.primary : theme.colors.border }}
          >
            <Text style={{ fontSize: theme.font.size.smd, color: active ? theme.colors.onPrimary : theme.colors.text }}>{labelFor ? labelFor(n) : String(n)}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

type Props = {
  config: ScheduleConfig
  onChange: (config: ScheduleConfig) => void
  submitLabel: string
  onSubmit: () => void
  busy: boolean
  /** Disable the submit button (e.g. fewer than two teams). */
  disabled?: boolean
  /** Which format the settings are for: pool size shows for pool formats, round-robin settings for everything but bracket-only. */
  format: TournamentFormat
}

/** The generator settings (for the tournament's format) plus the submit button. Used for both first-time generate and regenerate. */
export function ScheduleConfigForm({ config, onChange, submitLabel, onSubmit, busy, disabled, format }: Props) {
  const set = (patch: Partial<ScheduleConfig>) => onChange({ ...config, ...patch })
  const pools = format === 'pool_play' || format === 'pool_bracket'
  const roundRobin = format !== 'bracket'
  return (
    <View style={{ gap: 16 }}>
      <Field label={`Courts (${config.numCourts})`}>
        <Choices options={SCHEDULE_OPTIONS.courts} value={config.numCourts} onSelect={v => set({ numCourts: v })} padding={14} />
      </Field>
      <Field label={`Match duration (${config.matchDuration} min)`}>
        <Choices options={SCHEDULE_OPTIONS.matchDuration} value={config.matchDuration} onSelect={v => set({ matchDuration: v })} />
      </Field>
      <Field label={`Break between matches (${config.breakDuration} min)`}>
        <Choices options={SCHEDULE_OPTIONS.breakDuration} value={config.breakDuration} onSelect={v => set({ breakDuration: v })} />
      </Field>
      {pools && (
        <Field label={`Teams per pool (${config.teamsPerPool ?? 'Auto'})`}>
          <Choices
            options={SCHEDULE_OPTIONS.teamsPerPool}
            value={config.teamsPerPool}
            onSelect={v => set({ teamsPerPool: v })}
            labelFor={v => (v === null ? 'Auto' : String(v))}
            wrap
          />
          <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext, marginTop: 4 }}>Auto aims for pools of about four. Seeded teams are spread across pools.</Text>
        </Field>
      )}
      {roundRobin && (
        <Field label={`Games per team (${config.gamesPerTeam ?? 'Full round-robin'})`}>
          <Choices
            options={SCHEDULE_OPTIONS.gamesPerTeam}
            value={config.gamesPerTeam}
            onSelect={v => set({ gamesPerTeam: v })}
            labelFor={v => (v === null ? 'Full' : String(v))}
            wrap
          />
          <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext, marginTop: 4 }}>How many different opponents each team faces. Full = everyone plays everyone.</Text>
        </Field>
      )}
      {roundRobin && (
        <TouchableOpacity
          onPress={() => set({ restBetweenMatches: !config.restBetweenMatches })}
          accessibilityRole="switch"
          accessibilityState={{ checked: config.restBetweenMatches }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: theme.font.size.smd, fontWeight: '600', color: theme.colors.text }}>Break after every match</Text>
            <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext, marginTop: 2 }}>No team plays two slots in a row when it can be avoided. The day may run longer.</Text>
          </View>
          <View style={{ width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: config.restBetweenMatches ? theme.colors.primary : theme.colors.border, alignItems: config.restBetweenMatches ? 'flex-end' : 'flex-start' }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.white }} />
          </View>
        </TouchableOpacity>
      )}
      <Button label={submitLabel} onPress={onSubmit} loading={busy} disabled={disabled} testID="generate-schedule" />
    </View>
  )
}
