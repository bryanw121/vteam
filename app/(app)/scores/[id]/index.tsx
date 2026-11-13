import React, { useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { SheetTeamsView } from '../../../../components/programs/SheetTeamsView'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../../../../components/ui/Text'
import { Chip, ScreenContainer, ScreenHeader, ScreenState } from '../../../../components/ui'
import { RefreshControl } from '../../../../components/RefreshControl'
import { StandingsTable } from '../../../../components/tournament/StandingsTable'
import { BracketView } from '../../../../components/tournament/BracketView'
import { ts } from '../../../../components/tournament/tournamentStyles'
import { shared, theme } from '../../../../constants'
import { useSheetScores } from '../../../../hooks/useSheetScores'
import { useExternalPrograms } from '../../../../hooks/useExternalPrograms'
import { useUrlParam } from '../../../../hooks/useUrlParam'
import { VIEW } from '../../../../utils/urlViews'
import { routes } from '../../../../utils/routes'
import { openExternalUrl } from '../../../../lib/openExternalUrl'
import { Button } from '../../../../components/Button'
import { bracketGroups, bracketRows, liveMatches, poolStandings, upNext } from '../../../../utils/sheetScores'
import type { SheetScoresView } from '../../../../types'
import type { ScrollViewInstance } from 'react-native'

const VIEWS: { key: SheetScoresView; label: string }[] = [
  { key: 'live', label: 'Live' },
  { key: 'pools', label: 'Pools' },
  { key: 'brackets', label: 'Brackets' },
  { key: 'teams', label: 'Teams' },
]

const teamName = (id: string | null) => id ?? 'TBD'

/**
 * Scores & brackets of an outside tournament that runs its day on the Google Sheet tournament app
 * (constants/liveScores): courts in play, pool standings and division brackets, refreshed while
 * open. Read-only and public. The organizer's own site stays one tap away at the bottom.
 */
export default function ProgramScoresScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const scores = useSheetScores(id ?? null)
  const programs = useExternalPrograms()
  const program = useMemo(
    () => [...(programs.data?.tournaments ?? []), ...(programs.data?.elsewhere ?? [])].find(p => p.id === id) ?? null,
    [programs.data, id],
  )
  const [view, setView] = useUrlParam('view', VIEW.scores.view)
  const [divisionParam, setDivision] = useUrlParam('division', VIEW.scores.division)
  const [team, setTeam] = useUrlParam('team', VIEW.scores.team)
  const scrollRef = React.useRef<ScrollViewInstance>(null)
  // Any team name (standings, brackets, courts, a team's games) opens its page on the Teams tab.
  const openTeam = (name: string) => {
    setTeam(name)
    if (view !== 'teams') setView('teams')
    scrollRef.current?.scrollTo({ y: 0, animated: false })
  }
  const [refreshing, setRefreshing] = useState(false)

  const state = scores.data
  const live = useMemo(() => (state ? liveMatches(state) : []), [state])
  const next = useMemo(() => (state ? upNext(state) : []), [state])
  const pools = useMemo(() => (state ? poolStandings(state) : []), [state])
  const groups = useMemo(() => (state ? bracketGroups(state) : []), [state])
  const division = groups.includes(divisionParam) ? divisionParam : groups[0] ?? ''
  const bracket = useMemo(() => (state && division ? bracketRows(state, division) : []), [state, division])

  const title = program?.title ?? state?.settings.tournament_name ?? 'Scores'
  const updated = state?.serverTime ? new Date(state.serverTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null

  async function refresh() {
    setRefreshing(true)
    try { await scores.refetch({ force: true }) } finally { setRefreshing(false) }
  }

  return (
    <View style={shared.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenContainer>
        <ScreenHeader
          kicker="Scores & brackets"
          title={title}
          safeTop
          onBack={() => (router.canGoBack() ? router.back() : router.replace(routes.tournaments()))}
        />
        <ScreenState
          loading={scores.isLoading}
          ready={!!state}
          error={!scores.url ? null : scores.error && !state ? "Couldn't load scores from the tournament desk." : null}
          onRetry={() => { void scores.refetch({ force: true }) }}
          empty={!scores.url}
          emptyIcon="trophy-outline"
          emptyTitle="No live scores for this tournament"
          emptyBody="Scores show here when the organizers run the day on the vteam tournament sheet."
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} tintColor={theme.colors.primary} />}
          >
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.md }} accessibilityRole="radiogroup">
              {VIEWS.map(v => (
                <Chip key={v.key} label={v.label} role="radio" active={view === v.key} onPress={() => { if (v.key === 'teams') setTeam(''); setView(v.key) }} testID={`scores-view-${v.key}`} />
              ))}
            </View>

            {view === 'live' && (
              <View testID="scores-live">
                <Text style={[ts.sectionTitle, { marginBottom: theme.spacing.sm }]}>On court now · {live.length}</Text>
                {live.length === 0 && <Text style={[ts.muted13, { marginBottom: theme.spacing.md }]}>No games in play right now.</Text>}
                {live.map(m => (
                  <View key={m.id} style={ts.card} accessible accessibilityLabel={`${m.court ? `Court ${m.court}, ` : ''}${m.label}: ${m.teamA} versus ${m.teamB}, ${m.sets.map(s => `${s.a} to ${s.b}`).join(', ')}`}>
                    <View style={ts.rowBetween}>
                      <Text style={ts.sectionTitle}>{m.court ? `Court ${m.court} · ${m.label}` : m.label}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.hot }} />
                        <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.hot }}>LIVE</Text>
                      </View>
                    </View>
                    {[{ name: m.teamA, side: 'a' as const }, { name: m.teamB, side: 'b' as const }].map(t => (
                      <View key={t.side} style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 8 }}>
                        <Text
                          numberOfLines={1}
                          onPress={t.name !== 'TBD' ? () => openTeam(t.name) : undefined}
                          accessibilityRole={t.name !== 'TBD' ? 'link' : undefined}
                          style={{ flex: 1, fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.text }}
                        >{t.name}</Text>
                        {m.sets.map((s, i) => {
                          const current = i === m.sets.length - 1
                          return (
                            <Text
                              key={i}
                              style={{
                                width: 32, textAlign: 'right',
                                fontFamily: current ? theme.fonts.display : theme.fonts.body,
                                fontSize: current ? theme.font.size.lg : theme.font.size.smd,
                                color: current ? theme.colors.text : theme.colors.subtext,
                              }}
                            >{s[t.side]}</Text>
                          )
                        })}
                      </View>
                    ))}
                  </View>
                ))}
                {next.length > 0 && (
                  <View style={ts.card} testID="scores-up-next">
                    <Text style={[ts.sectionTitle, { marginBottom: theme.spacing.sm }]}>Up next</Text>
                    {next.map((g, i) => (
                      <View key={`${g.pool}-${g.game ?? i}`} style={{ flexDirection: 'row', gap: theme.spacing.sm, paddingVertical: 6 }}>
                        <Text style={[ts.muted13, { width: 92 }]} numberOfLines={1}>{[g.court ? `Ct ${g.court}` : null, g.time].filter(Boolean).join(' · ') || `Pool ${g.pool}`}</Text>
                        <Text style={{ flex: 1, fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.text }} numberOfLines={1}>
                          {g.a} vs {g.b}
                        </Text>
                        <Text style={ts.muted13}>Pool {g.pool}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {view === 'pools' && (
              <View testID="scores-pools">
                {pools.length === 0 && <Text style={ts.muted13}>Pools haven't been set yet.</Text>}
                {pools.map(p => (
                  <StandingsTable key={p.poolKey} title={p.name} rows={p.rows} teamName={teamName} onPressTeam={openTeam} testID={`scores-pool-${p.poolKey}`} />
                ))}
              </View>
            )}

            {view === 'teams' && state && <SheetTeamsView state={state} team={team} onSelectTeam={openTeam} />}

            {view === 'brackets' && (
              <View testID="scores-brackets">
                {groups.length === 0 ? (
                  <Text style={ts.muted13}>Brackets start after pool play.</Text>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.md }} accessibilityRole="radiogroup">
                      {groups.map(g => (
                        <Chip key={g} label={g} variant="tint" role="radio" active={division === g} onPress={() => setDivision(g)} testID={`scores-division-${g}`} />
                      ))}
                    </View>
                    <BracketView matches={bracket} teamName={teamName} onPressTeam={openTeam} />
                  </>
                )}
              </View>
            )}

            <Text style={[shared.caption, { marginTop: theme.spacing.lg }]}>
              {updated ? `Updated ${updated} · ` : ''}Live from the tournament desk; refreshes on its own.
            </Text>
            {program?.source_url || program?.signup_url ? (
              <Text
                accessibilityRole="link"
                onPress={() => { void openExternalUrl((program.source_url || program.signup_url) as string) }}
                style={[shared.caption, { color: theme.colors.primary, marginTop: theme.spacing.sm, paddingVertical: 10 }]}
              >
                {program.org} website <Ionicons name="open-outline" size={12} color={theme.colors.primary} />
              </Text>
            ) : null}
            <View style={{ marginTop: theme.spacing.lg }}>
              <Button
                label="I'm a scorekeeper"
                icon="clipboard-outline"
                variant="secondary"
                onPress={() => router.push(routes.programScorekeeper(id as string))}
                testID="scores-scorekeeper"
              />
            </View>
          </ScrollView>
        </ScreenState>
      </ScreenContainer>
    </View>
  )
}
