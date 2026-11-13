import React from 'react'
import { Switch, TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { DatePickerField } from '../DatePickerField'
import { DAY_LABELS_SHORT, shared, theme } from '../../constants'
import type { RecurrenceCadence } from '../../constants'
import type { HostRepeatSectionProps } from '../../types'

const CADENCE_OPTIONS: { value: RecurrenceCadence; label: string }[] = [
  { value: 'weekly',   label: 'Weekly'    },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly',  label: 'Monthly'   },
]

/** Repeat (create only): cadence, weekdays, until, and how many games it makes. */
export function RepeatSection({ recurrence, onChange, eventCount }: HostRepeatSectionProps) {
  const showDayPicker = recurrence.enabled && recurrence.cadence !== 'monthly'
  const toggleDay = (dayIdx: number) => onChange(prev => {
    const already = prev.days.includes(dayIdx)
    return { ...prev, days: already ? prev.days.filter(d => d !== dayIdx) : [...prev.days, dayIdx] }
  })
  return (
    <View style={shared.hostFieldCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={shared.hostFieldLabel}>Repeat</Text>
        <Switch
          accessibilityLabel="Repeat this event"
          value={recurrence.enabled}
          onValueChange={v => onChange(prev => ({ ...prev, enabled: v }))}
          trackColor={{ false: theme.colors.border, true: theme.colors.primary + '80' }}
          thumbColor={recurrence.enabled ? theme.colors.primary : theme.colors.subtext}
        />
      </View>
      {recurrence.enabled && (
        <View style={{ marginTop: 14, gap: 12 }}>
          <View style={{ flexDirection: 'row', borderRadius: theme.radius.md, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border, alignSelf: 'flex-start' }}>
            {CADENCE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => onChange(prev => ({ ...prev, cadence: opt.value }))}
                style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, backgroundColor: recurrence.cadence === opt.value ? theme.colors.primary : 'transparent' }}
              >
                <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium, color: recurrence.cadence === opt.value ? theme.colors.white : theme.colors.subtext }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {showDayPicker && (
            <View>
              <Text style={[shared.caption, { marginBottom: theme.spacing.xs }]}>On these days</Text>
              <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
                {DAY_LABELS_SHORT.map((label, i) => {
                  const active = recurrence.days.includes(i)
                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => toggleDay(i)}
                      style={{
                        width: 36, height: 36, borderRadius: 18,
                        borderWidth: 1.5,
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                        backgroundColor: active ? theme.colors.primary : 'transparent',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.semibold, color: active ? theme.colors.white : theme.colors.subtext }}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          )}
          <View>
            <Text style={[shared.caption, { marginBottom: theme.spacing.xs }]}>Until</Text>
            <DatePickerField value={recurrence.endDate} onChange={d => onChange(prev => ({ ...prev, endDate: d }))} />
          </View>
          {eventCount > 0 && (
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.primaryText }}>
              {eventCount} event{eventCount !== 1 ? 's' : ''} will be created
            </Text>
          )}
        </View>
      )}
    </View>
  )
}
