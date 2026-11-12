import React from 'react'
import { ScrollView, View } from 'react-native'
import { Text } from '../ui/Text'
import type { RefreshControlProps } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme } from '../../constants'
import { PODIUM_LABELS } from '../../constants/tournamentCopy'
import { Button } from '../Button'
import { EmptyState } from '../ui'
import type { Podium, PoolStandings, StandingRow, Tournament, TournamentMatchRow, TournamentTeam } from '../../types'
import { BracketView } from './BracketView'
import { StandingsTable } from './StandingsTable'
import { ts } from './tournamentStyles'
import { Spinner } from '../ui/Spinner'

type Props = {
  refreshControl?: React.ReactElement<RefreshControlProps>
  tournament: Tournament
  matches: TournamentMatchRow[]
  loading: boolean
  error: boolean
  onRetry: () => void
  teamName: (id: string | null) => string
  myTeam: TournamentTeam | null
  isCreator: boolean
  /** Pool tables (pool formats) in pool order. */
  poolTables: PoolStandings[]
  /** Whole-field table (round robin), or null. */
  overall: StandingRow[] | null
  podium: Podium | null
  /** Organizer, pool + bracket format: the seeds the bracket would get now, or null when not offered. */
  seedPreview: { teamId: string; label: string }[] | null
  /** Pool matches still unplayed (warns before seeding). */
  poolMatchesLeft: number
  bracketExists: boolean
  seeding: boolean
  onSeedBracket: () => void
  onPressMatch?: (match: TournamentMatchRow) => void
}

const MEDALS = [theme.colors.medalGold, theme.colors.medalSilver, theme.colors.medalBronze]

function PodiumCard({ podium, teamName }: { podium: Podium; teamName: Props['teamName'] }) {
  const places: { label: string; ids: string[] }[] = [
    { label: PODIUM_LABELS[0], ids: podium.first ? [podium.first] : [] },
    { label: PODIUM_LABELS[1], ids: podium.second ? [podium.second] : [] },
    { label: PODIUM_LABELS[2], ids: podium.thirds },
  ]
  return (
    <View style={ts.card} testID="tournament-podium">
      <Text style={[ts.sectionTitle, { marginBottom: theme.spacing.sm }]}>Podium</Text>
      {places.filter(p => p.ids.length > 0).map((p, i) => (
        <View key={p.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: MEDALS[i] }}>
            <Ionicons name="trophy" size={18} color={theme.colors.black} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              {p.label}{p.ids.length > 1 ? ' (tied)' : ''}
            </Text>
            <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.lgs, color: theme.colors.text }}>{p.ids.map(id => teamName(id)).join(' & ')}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

/** Results: podium, bracket, and standings, plus the organizer's "seed the bracket from pools" step. */
export function ResultsTab(p: Props) {
  if (p.loading && p.matches.length === 0) {
    return <View style={{ paddingVertical: 32 }}><Spinner color={theme.colors.primary} /></View>
  }
  if (p.error && p.matches.length === 0) {
    return (
      <View style={[shared.screenStateCenter, { flex: 0, paddingVertical: 32 }]}>
        <Text style={[shared.caption, shared.emptyStateBody]}>Couldn't load results.</Text>
        <Button label="Retry" variant="secondary" size="sm" fullWidth={false} onPress={p.onRetry} />
      </View>
    )
  }

  const visible = p.isCreator || p.tournament.schedule_published
  const bracket = p.matches.filter(m => m.stage === 'bracket')
  const hasAnything = visible && (p.matches.length > 0 || !!p.seedPreview)

  return (
    <ScrollView contentContainerStyle={ts.scrollContent} showsVerticalScrollIndicator={false} refreshControl={p.refreshControl}>
      {visible && !hasAnything && (
        <EmptyState icon="podium-outline" title="No results yet" body="Standings and the bracket show up here once the schedule is out." />
      )}

      {visible && p.podium && <PodiumCard podium={p.podium} teamName={p.teamName} />}

      {p.seedPreview && (
        <View style={[ts.card, { gap: theme.spacing.sm }]} testID="seed-bracket-card">
          <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.base, color: theme.colors.text }}>
            {p.bracketExists ? 'Reseed the bracket' : 'Bracket from pool results'}
          </Text>
          <Text style={ts.muted13}>
            Seeds come from the pool tables: every pool winner, then every runner-up. Teams from the same pool are kept apart in the first round when possible.
          </Text>
          {p.poolMatchesLeft > 0 && (
            <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.smd, color: theme.colors.warning }}>
              {p.poolMatchesLeft} pool {p.poolMatchesLeft === 1 ? 'match is' : 'matches are'} still to be played.
            </Text>
          )}
          {p.seedPreview.map((s, i) => (
            <Text key={s.teamId} style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.text }}>
              {i + 1}. {p.teamName(s.teamId)} <Text style={{ color: theme.colors.subtext }}>· {s.label}</Text>
            </Text>
          ))}
          <Button
            label={p.bracketExists ? 'Reseed bracket' : 'Create bracket'}
            icon="git-network-outline"
            onPress={p.onSeedBracket}
            loading={p.seeding}
            disabled={p.seedPreview.length < 2}
            testID="seed-bracket"
          />
        </View>
      )}

      {visible && bracket.length > 0 && (
        <View style={{ marginBottom: theme.spacing.md }}>
          <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.lg, color: theme.colors.text, marginBottom: theme.spacing.sm }}>Bracket</Text>
          <BracketView matches={bracket} teamName={p.teamName} myTeamId={p.myTeam?.id} onPressMatch={p.onPressMatch} />
        </View>
      )}

      {visible && p.overall && p.overall.length > 0 && (
        <StandingsTable title="Standings" rows={p.overall} teamName={id => p.teamName(id)} myTeamId={p.myTeam?.id} testID="standings-overall" />
      )}

      {visible && p.poolTables.map(t => (
        <StandingsTable
          key={t.poolKey}
          title={t.name}
          rows={t.rows}
          teamName={id => p.teamName(id)}
          myTeamId={p.myTeam?.id}
          advanceCount={p.tournament.format === 'pool_bracket' ? p.tournament.teams_advance_per_pool : undefined}
          testID={`standings-${t.name}`}
        />
      ))}

      {!visible && <EmptyState icon="podium-outline" title="Results aren't public yet" body="They appear once the organizer publishes the schedule." />}
    </ScrollView>
  )
}
