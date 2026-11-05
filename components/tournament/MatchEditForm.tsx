import React, { useState } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import { Button } from '../Button'
import { Input } from '../Input'
import type { TournamentTeamWithRoster } from '../../types'
import type { TournamentMatchRow } from '../../types'

type Props = {
  match: TournamentMatchRow
  teams: TournamentTeamWithRoster[]
  saving: boolean
  onSave: (scheduledAt: string, court: string, teamAId: string | null, teamBId: string | null) => void
  onCancel: () => void
}

function TeamPicker({ label, teams, value, onSelect }: {
  label: string
  teams: TournamentTeamWithRoster[]
  value: string | null
  onSelect: (id: string) => void
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {teams.map(t => (
            <TouchableOpacity
              key={t.id}
              onPress={() => onSelect(t.id)}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: value === t.id ? theme.colors.primary : theme.colors.border }}
            >
              <Text style={{ fontSize: theme.font.size.sm, color: value === t.id ? theme.colors.onPrimary : theme.colors.text }}>{t.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

/** "YYYY-MM-DDTHH:MM" in the viewer's local time, as the start-time field shows and re-parses it. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function MatchEditForm({ match, teams, saving, onSave, onCancel }: Props) {
  const [court, setCourt] = useState(match.court ?? '')
  const [scheduledAt, setScheduledAt] = useState(match.scheduled_at ? toLocalInput(match.scheduled_at) : '')
  const [teamAId, setTeamAId] = useState<string | null>(match.team_a_id)
  const [teamBId, setTeamBId] = useState<string | null>(match.team_b_id)

  const parsed = scheduledAt ? new Date(scheduledAt) : null
  const invalidTime = !!parsed && Number.isNaN(parsed.getTime())

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontSize: theme.font.size.smd, fontWeight: '700', color: theme.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.6 }}>Edit Match</Text>
      <Input label="Court" value={court} onChangeText={setCourt} placeholder="Court A" containerStyle={{ marginBottom: 0 }} inputStyle={{ backgroundColor: theme.colors.background }} />
      <Input
        label="Start time"
        value={scheduledAt}
        onChangeText={setScheduledAt}
        placeholder="YYYY-MM-DDTHH:MM"
        error={invalidTime ? 'Use the format YYYY-MM-DDTHH:MM' : undefined}
        autoCapitalize="none"
        containerStyle={{ marginBottom: 0 }}
        inputStyle={{ backgroundColor: theme.colors.background }}
      />
      <TeamPicker label="Team A" teams={teams} value={teamAId} onSelect={setTeamAId} />
      <TeamPicker label="Team B" teams={teams} value={teamBId} onSelect={setTeamBId} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button label="Cancel" variant="secondary" size="sm" onPress={onCancel} disabled={saving} /></View>
        <View style={{ flex: 1 }}>
          <Button
            label="Save"
            size="sm"
            loading={saving}
            disabled={invalidTime}
            onPress={() => onSave(parsed ? parsed.toISOString() : (match.scheduled_at as string), court, teamAId, teamBId)}
          />
        </View>
      </View>
    </View>
  )
}
