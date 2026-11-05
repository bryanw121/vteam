import React, { useEffect, useState } from 'react'
import { ScrollView, View, useWindowDimensions } from 'react-native'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import { seededOrder } from '../../lib/tournamentSchedule'
import { BottomSheet, IconButton } from '../ui'
import { Button } from '../Button'
import type { TournamentTeamWithRoster } from '../../types'

type Props = {
  visible: boolean
  /** Registered teams (any order; current seeds decide the starting order). */
  teams: TournamentTeamWithRoster[]
  busy: boolean
  onDismiss: () => void
  /** Resolves true when saved. Only teams whose seed changed are passed. */
  onSave: (seeds: { teamId: string; seed: number | null }[]) => Promise<boolean>
}

/**
 * Organizer seeding: order the teams strongest first. Seeds spread the top
 * teams across pools and decide bracket positions (top seeds get the byes).
 */
export function SeedSheet({ visible, teams, busy, onDismiss, onSave }: Props) {
  const { height } = useWindowDimensions()
  const [order, setOrder] = useState<string[]>([])
  useEffect(() => {
    if (visible) setOrder(seededOrder(teams.map(t => ({ id: t.id, seed: t.seed }))))
  }, [visible, teams])

  const name = (id: string) => teams.find(t => t.id === id)?.name ?? 'Team'
  const move = (i: number, by: -1 | 1) => setOrder(o => {
    const j = i + by
    if (j < 0 || j >= o.length) return o
    const next = [...o]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })

  async function save() {
    const changes = order
      .map((teamId, i) => ({ teamId, seed: i + 1 as number | null }))
      .filter(c => teams.find(t => t.id === c.teamId)?.seed !== c.seed)
    if (changes.length === 0) { onDismiss(); return }
    if (await onSave(changes)) onDismiss()
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Set seeds">
      <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.subtext, marginBottom: theme.spacing.md }}>
        Strongest team first. Seeds spread the top teams across pools and give the top seeds any first-round byes.
      </Text>
      <ScrollView style={{ maxHeight: height * 0.5 }} contentContainerStyle={{ gap: theme.spacing.xs }}>
        {order.map((id, i) => (
          <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: 4 }}>
            <Text style={{ width: 28, fontFamily: theme.fonts.display, fontSize: theme.font.size.md, color: theme.colors.subtext }}>{i + 1}</Text>
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.text }}>{name(id)}</Text>
            <IconButton icon="chevron-up" label={`Move ${name(id)} up`} size={44} onPress={() => move(i, -1)} />
            <IconButton icon="chevron-down" label={`Move ${name(id)} down`} size={44} onPress={() => move(i, 1)} />
          </View>
        ))}
      </ScrollView>
      <View style={{ marginTop: theme.spacing.md }}>
        <Button label="Save seeds" onPress={() => { void save() }} loading={busy} />
      </View>
    </BottomSheet>
  )
}
