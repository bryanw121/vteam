import React from 'react'
import { View } from 'react-native'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import type { StandingRow } from '../../types'
import { ts } from './tournamentStyles'

type Props = {
  title: string
  rows: StandingRow[]
  teamName: (id: string) => string
  /** Rows at or above this rank are marked as advancing (pool → bracket). */
  advanceCount?: number
  /** The viewer's team, highlighted. */
  myTeamId?: string | null
  testID?: string
}

const cell = { fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.text } as const
const head = { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.subtext, letterSpacing: 0.5 } as const

/** One standings table: rank, team, W-L, sets, point difference. */
export function StandingsTable({ title, rows, teamName, advanceCount, myTeamId, testID }: Props) {
  return (
    <View style={ts.card} testID={testID}>
      <Text style={[ts.sectionTitle, { marginBottom: theme.spacing.sm }]}>{title}</Text>
      <View accessibilityRole="header" style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
        <Text style={[head, { width: 28 }]}>#</Text>
        <Text style={[head, { flex: 1 }]}>TEAM</Text>
        <Text style={[head, { width: 44, textAlign: 'center' }]}>W-L</Text>
        <Text style={[head, { width: 48, textAlign: 'center' }]}>SETS</Text>
        <Text style={[head, { width: 44, textAlign: 'right' }]}>+/-</Text>
      </View>
      {rows.map((r, i) => {
        const advancing = advanceCount !== undefined && i < advanceCount && r.played > 0
        const mine = !!myTeamId && r.teamId === myTeamId
        const diff = r.pointsFor - r.pointsAgainst
        return (
          <View
            key={r.teamId}
            accessible
            accessibilityLabel={`${r.tied ? 'Tied ' : ''}${r.rank}. ${teamName(r.teamId)}, ${r.wins} wins, ${r.losses} losses${advancing ? ', advancing' : ''}`}
            style={{
              flexDirection: 'row', alignItems: 'center', paddingVertical: 9,
              borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: theme.colors.borderSoft,
              backgroundColor: mine ? theme.colors.primarySoft : 'transparent',
            }}
          >
            <Text style={[cell, { width: 28, color: theme.colors.subtext }]}>{r.tied ? `=${r.rank}` : r.rank}</Text>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {advancing && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.cool }} />}
              <Text numberOfLines={1} style={[cell, { flexShrink: 1, fontFamily: theme.fonts.bodySemiBold }]}>{teamName(r.teamId)}</Text>
            </View>
            <Text style={[cell, { width: 44, textAlign: 'center' }]}>{r.wins}-{r.losses}</Text>
            <Text style={[cell, { width: 48, textAlign: 'center', color: theme.colors.subtext }]}>{r.setsWon}-{r.setsLost}</Text>
            <Text style={[cell, { width: 44, textAlign: 'right', color: diff > 0 ? theme.colors.cool : diff < 0 ? theme.colors.hot : theme.colors.subtext }]}>
              {diff > 0 ? `+${diff}` : diff}
            </Text>
          </View>
        )
      })}
      {advanceCount !== undefined && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.spacing.sm }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.cool }} />
          <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext }}>Top {advanceCount} advance to the bracket</Text>
        </View>
      )}
    </View>
  )
}
