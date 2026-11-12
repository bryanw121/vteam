import React from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import type { TournamentMatchRow } from '../../types'
import { ts } from './tournamentStyles'

type Props = {
  matches: TournamentMatchRow[]
  teamName: (id: string | null) => string
  myTeamId?: string | null
  /** Organizer: tap a playable match to record its result. */
  onPressMatch?: (match: TournamentMatchRow) => void
}

const COLUMN_WIDTH = 190

function setLine(m: TournamentMatchRow): string {
  if (m.status === 'forfeit') return 'Forfeit'
  return m.sets.map(s => `${s.team_a_score}-${s.team_b_score}`).join(', ')
}

function MatchBox({ match, teamName, myTeamId, onPress }: { match: TournamentMatchRow; teamName: Props['teamName']; myTeamId?: string | null; onPress?: () => void }) {
  const done = !!match.winner_id
  const playable = !!onPress && !!match.team_a_id && !!match.team_b_id
  const row = (id: string | null) => {
    const won = done && match.winner_id === id
    const mine = !!myTeamId && id === myTeamId
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5 }}>
        {mine && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.primary }} />}
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: won ? theme.fonts.bodyBold : theme.fonts.body,
            fontSize: theme.font.size.smd,
            color: !id ? theme.colors.subtext : done && !won ? theme.colors.subtext : theme.colors.text,
          }}
        >{teamName(id)}</Text>
        {won && <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.cool, fontFamily: theme.fonts.bodySemiBold }}>W</Text>}
      </View>
    )
  }
  const body = (
    <View style={{
      backgroundColor: theme.colors.card, borderRadius: theme.radius.md, borderWidth: 1,
      borderColor: playable && !done ? theme.colors.primary : theme.colors.border, paddingHorizontal: 10, paddingVertical: 6,
    }}>
      {row(match.team_a_id)}
      <View style={{ height: 1, backgroundColor: theme.colors.borderSoft }} />
      {row(match.team_b_id)}
      {(done || !!match.court) && (
        <Text numberOfLines={1} style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext, marginTop: 2 }}>
          {done ? setLine(match) : match.court}
        </Text>
      )}
    </View>
  )
  if (!playable) return body
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${match.bracket_round_name ?? 'Match'}: ${teamName(match.team_a_id)} vs ${teamName(match.team_b_id)}. ${done ? 'Edit result' : 'Record result'}`}
      style={{ minHeight: 44 }}
    >
      {body}
    </TouchableOpacity>
  )
}

/** Columns of rounds, scrolled sideways; each column's matches spread evenly so later rounds sit between their feeders. */
function Columns({ matches, ...rest }: Props) {
  const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b)
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.md }}>
      {rounds.map(round => {
        const list = matches.filter(m => m.round === round).sort((a, b) => a.match_number - b.match_number)
        return (
          <View key={round} style={{ width: COLUMN_WIDTH }}>
            <Text numberOfLines={1} style={[ts.sectionTitle, { marginBottom: theme.spacing.sm }]}>{list[0]?.bracket_round_name ?? `Round ${round}`}</Text>
            <View style={{ flex: 1, justifyContent: 'space-around', gap: theme.spacing.sm }}>
              {list.map(m => (
                <View key={m.id}>
                  {list.length > 1 && m.bracket_round_name !== list[0]?.bracket_round_name && (
                    <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.subtext, marginBottom: 4 }}>{m.bracket_round_name}</Text>
                  )}
                  <MatchBox match={m} teamName={rest.teamName} myTeamId={rest.myTeamId} onPress={rest.onPressMatch ? () => rest.onPressMatch?.(m) : undefined} />
                </View>
              ))}
            </View>
          </View>
        )
      })}
    </ScrollView>
  )
}

/** The elimination bracket: winners (or only) bracket, then the losers bracket for double elimination. */
export function BracketView(props: Props) {
  const winners = props.matches.filter(m => m.stage === 'bracket' && !m.is_losers_bracket)
  const losers = props.matches.filter(m => m.stage === 'bracket' && m.is_losers_bracket)
  return (
    <View style={{ gap: theme.spacing.md }} testID="tournament-bracket">
      <Columns {...props} matches={winners} />
      {losers.length > 0 && (
        <>
          <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.lgs, color: theme.colors.text }}>Losers bracket</Text>
          <Columns {...props} matches={losers} />
        </>
      )}
    </View>
  )
}
