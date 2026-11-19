import React, { useMemo, useState } from 'react'
import { TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text, TextInput } from '../ui/Text'
import { ts } from '../tournament/tournamentStyles'
import { theme } from '../../constants'
import { record, teamDetail, teamList } from '../../utils/sheetScores'
import type { SheetTeamGame, SheetTeamsViewProps } from '../../types'

const RESULT_COLOR = { W: theme.colors.cool, L: theme.colors.hot, T: theme.colors.subtext } as const

/**
 * Teams tab of the live scores screen: every team A–Z with a search box, and a team's page
 * (pool rank, division seed, six stats, every game from its side) when `team` is set. Same
 * content as the Sheet app's own Teams page.
 */
export function SheetTeamsView({ state, team, onSelectTeam }: SheetTeamsViewProps) {
  const [query, setQuery] = useState('')
  const list = useMemo(() => teamList(state, query), [state, query])
  const detail = useMemo(() => (team ? teamDetail(state, team) : null), [state, team])

  if (detail) {
    const s = detail.standing
    const diff = s.points_for - s.points_against
    const stats: [string, string][] = [
      [record(s), 'Pool record'],
      [`${s.sets_won}-${s.sets_lost}`, 'Sets'],
      [s.set_pct != null ? `${Math.round(s.set_pct * 100)}%` : '–', 'Sets won'],
      [`${s.points_for}-${s.points_against}`, 'Points'],
      [diff > 0 ? `+${diff}` : String(diff), 'Point diff'],
      [s.point_ratio != null ? String(s.point_ratio) : '–', 'Point ratio'],
    ]
    return (
      <View testID="scores-team">
        <TouchableOpacity
          onPress={() => onSelectTeam('')}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' }}
        >
          <Ionicons name="chevron-back" size={16} color={theme.colors.primary} />
          <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.primary }}>All teams</Text>
        </TouchableOpacity>
        <View style={ts.card}>
          <Text accessibilityRole="header" style={{ fontFamily: theme.fonts.display, fontSize: theme.font.heading.md, color: theme.colors.text }}>{detail.name}</Text>
          <Text style={[ts.muted13, { marginTop: 2 }]}>
            Pool {s.pool} · ranked #{s.rank} of {detail.poolSize}
            {detail.seed ? ` · ${detail.seed.division} seed ${detail.seed.seed}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: theme.spacing.md, rowGap: theme.spacing.md }}>
            {stats.map(([value, label]) => (
              <View key={label} style={{ width: '33.33%' }} accessible accessibilityLabel={`${label}: ${value}`}>
                <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.lg, color: theme.colors.text }}>{value}</Text>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext }}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={ts.card}>
          <Text style={[ts.sectionTitle, { marginBottom: theme.spacing.sm }]}>Games · {detail.games.length}</Text>
          {detail.games.length === 0 && <Text style={ts.muted13}>No games yet.</Text>}
          {detail.games.map((g, i) => (
            <GameRow key={g.id} game={g} last={i === detail.games.length - 1} onSelectTeam={onSelectTeam} />
          ))}
        </View>
      </View>
    )
  }

  return (
    <View testID="scores-teams">
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.colors.card,
        marginBottom: theme.spacing.md,
      }}>
        <Ionicons name="search-outline" size={18} color={theme.colors.subtext} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Find a team"
          placeholderTextColor={theme.colors.subtext}
          accessibilityLabel="Find a team"
          style={{ flex: 1, minWidth: 0, fontFamily: theme.fonts.body, fontSize: theme.font.size.base, color: theme.colors.text, padding: 0 }}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>
      <Text style={[ts.sectionTitle, { marginBottom: theme.spacing.sm }]}>Teams · {list.length}</Text>
      {list.length === 0 && <Text style={ts.muted13}>No teams match “{query.trim()}”.</Text>}
      <View style={[ts.card, { paddingVertical: 4 }]}>
        {list.map((s, i) => (
          <TouchableOpacity
            key={s.team}
            onPress={() => onSelectTeam(s.team)}
            accessibilityRole="button"
            accessibilityLabel={`${s.team}, pool ${s.pool}, rank ${s.rank}, ${record(s)}`}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48,
              borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: theme.colors.borderSoft,
            }}
          >
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.text }}>{s.team}</Text>
            <Text style={ts.muted13}>Pool {s.pool} · #{s.rank} · {record(s)}</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.subtext} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

/** One game on a team's page: W / L / T (or LIVE, or Next), the opponent (tappable), where, and the score. */
function GameRow({ game: g, last, onSelectTeam }: { game: SheetTeamGame; last: boolean; onSelectTeam: (team: string) => void }) {
  const badge = g.ref ? 'Ref' : g.status === 'live' ? 'LIVE' : g.status === 'upcoming' ? 'Next' : g.result ?? ''
  const color = g.status === 'live' ? theme.colors.hot : g.result ? RESULT_COLOR[g.result] : theme.colors.subtext
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: theme.colors.borderSoft }}>
      <View style={{ width: 40, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {g.status === 'live' && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.hot }} />}
        <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color }}>{badge}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {g.opponent ? (
          <Text
            numberOfLines={1}
            onPress={() => onSelectTeam(g.opponent as string)}
            accessibilityRole="link"
            style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.text }}
          >vs {g.opponent}</Text>
        ) : (
          <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.md, color: theme.colors.subtext }}>{g.ref ? 'Reffing' : g.bye ? 'Bye' : 'vs TBD'}</Text>
        )}
        <Text numberOfLines={1} style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext }}>{g.label}</Text>
      </View>
      <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.text, textAlign: 'right' }}>{g.detail}</Text>
    </View>
  )
}
