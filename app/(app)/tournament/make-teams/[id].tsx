import React, { useMemo, useState } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../../../../components/ui/Text'
import { Chip, ConfirmDialog, ScreenContainer, ScreenHeader, ScreenState } from '../../../../components/ui'
import { Button } from '../../../../components/Button'
import { useSession } from '../../../../contexts/session'
import { STALE, theme } from '../../../../constants'
import { SKILL_LEVEL_LABELS } from '../../../../constants/copy'
import { useQuery } from '../../../../lib/query'
import { toast } from '../../../../lib/toast'
import { fetchTeams, fetchTournamentCore, tournamentKeys } from '../../../../hooks/tournament/api'
import { useTournamentActions } from '../../../../hooks/tournament/useTournamentActions'
import { profileDisplayName, volleyballPositionsAbbreviated } from '../../../../utils'
import { routes } from '../../../../utils/routes'
import {
  addPinGroup, cleanPins, drawSoloTeams, removePinGroup, soloTeamCount, soloTeamLevel, soloTeamSizes,
} from '../../../../utils/soloTeams'
import type { BalancePlayer, SoloTeamDraft, TeamMode, TournamentTeamWithRoster } from '../../../../types'

type Player = BalancePlayer & { name: string; first: string; line: string; pos: string }

const TEAMS_TAB = 1

/** The solo sign-ups as players: one per free-agent entry, with what the shuffle and the rows need. */
function soloPlayers(teams: TournamentTeamWithRoster[]): Player[] {
  return teams.filter(t => t.status === 'free_agent').flatMap(t => t.members).map(m => {
    const p = m.profiles
    const name = p ? profileDisplayName(p) : 'Player'
    const pos = volleyballPositionsAbbreviated(p?.position ?? [])
    const level = p?.skill_level ? SKILL_LEVEL_LABELS[p.skill_level] ?? null : null
    return {
      id: m.user_id,
      skillLevel: p?.skill_level ?? null,
      isSetter: (p?.position ?? []).includes('setter'),
      name,
      first: name.split(' ')[0],
      pos,
      line: [pos, level].filter(Boolean).join(' · ') || 'No position or level set',
    }
  })
}

/**
 * Make teams for a solo sign-up tournament (#282), organizer only: keep friends
 * together (saved on the tournament as you go), shuffle at random or balanced
 * by level, swap players by tapping two, then post. Posting turns the solo
 * sign-ups into teams in one call (`post_solo_teams`); until then the draft is
 * only on this screen.
 */
export default function MakeTeamsScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { userId } = useSession()
  const core = useQuery(tournamentKeys.core(id), () => fetchTournamentCore(id), { staleMs: STALE.detail })
  const teamsQ = useQuery(tournamentKeys.teams(id), () => fetchTeams(id), { staleMs: STALE.detail })
  const actions = useTournamentActions(id, userId)

  const tournament = core.data?.tournament ?? null
  const players = useMemo(() => soloPlayers(teamsQ.data ?? []), [teamsQ.data])
  const byId = useMemo(() => new Map(players.map(p => [p.id, p])), [players])
  const ids = useMemo(() => players.map(p => p.id), [players])
  const savedPins = useMemo(() => cleanPins(tournament?.team_pins, ids), [tournament?.team_pins, ids])
  const [pins, setPins] = useState<string[][] | null>(null)
  const groups = pins ?? savedPins
  const pinnedIds = useMemo(() => new Set(groups.flat()), [groups])

  const [selected, setSelected] = useState<string[]>([])
  const [mode, setMode] = useState<TeamMode>('balanced')
  const [draft, setDraft] = useState<SoloTeamDraft[] | null>(null)
  const [swapFrom, setSwapFrom] = useState<string | null>(null)
  const [confirmPost, setConfirmPost] = useState(false)

  const size = tournament?.team_size ?? 6
  const teamCount = soloTeamCount(players.length, size)
  const sizes = soloTeamSizes(players.length, teamCount)
  const isOrganizer = !!tournament && !!userId && tournament.created_by === userId
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(routes.tournament(id)))

  function changePins(next: string[][]) {
    setPins(next)
    void actions.savePins.mutate(next)
  }

  function keepTogether() {
    changePins(addPinGroup(groups, selected))
    setSelected([])
  }

  function shuffle() {
    setDraft(drawSoloTeams(players, { size, pins: groups, mode }))
    setSwapFrom(null)
  }

  /** Tap a player, then one on another team: they trade places. Pinned players stay put. */
  function tapDrafted(pid: string) {
    if (!draft || pinnedIds.has(pid)) return
    if (!swapFrom || swapFrom === pid) { setSwapFrom(swapFrom === pid ? null : pid); return }
    const ta = draft.findIndex(t => t.members.includes(swapFrom))
    const tb = draft.findIndex(t => t.members.includes(pid))
    if (ta === tb) { setSwapFrom(pid); return }
    setDraft(draft.map((t, i) => {
      if (i !== ta && i !== tb) return t
      const members = t.members.map(m => (m === swapFrom ? pid : m === pid ? swapFrom : m))
      return { ...t, members, captain: t.captain === swapFrom || t.captain === pid ? members[0] : t.captain }
    }))
    setSwapFrom(null)
  }

  async function post() {
    if (!draft) return
    const done = await actions.postSoloTeams.mutate(draft)
    setConfirmPost(false)
    if (!done) return
    toast.show({ variant: 'success', title: 'Teams posted', message: `${draft.length} teams are on the Teams tab.` })
    router.replace(routes.tournament(id, { tab: TEAMS_TAB }))
  }

  // A missing row (not a club member, or no such tournament) is a refusal too.
  const notAllowed = !!core.data && (!tournament || !isOrganizer || tournament.team_mode !== 'solo')
  const kicker = tournament ? `${tournament.title} · ${draft ? 'draft, only you see it' : 'make teams'}` : undefined

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenContainer>
        <ScreenHeader
          safeTop
          kicker={kicker}
          title={draft ? `${draft.length} teams` : 'Make teams'}
          onBack={draft ? () => setDraft(null) : goBack}
          backLabel={draft ? 'Pins' : 'Back'}
        />
        <ScreenState
          loading={core.isLoading || teamsQ.isLoading}
          ready={!!core.data && !!teamsQ.data && !notAllowed}
          error={core.error || teamsQ.error
            ? "Couldn't load the sign-ups."
            : notAllowed ? 'Only the organizer of a solo sign-up tournament can make teams.' : null}
          onRetry={() => { void core.refetch({ force: true }); void teamsQ.refetch({ force: true }) }}
          empty={!!core.data && !!teamsQ.data && players.length < 2}
          emptyIcon="people-outline"
          emptyTitle="Not enough sign-ups yet"
          emptyBody="Teams can be made once two or more players have signed up solo."
        >
          {!draft ? (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 200 }}>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.md, color: theme.colors.subtext, marginBottom: 14 }}>
                {players.length} players → {teamCount} teams of {sizes.length && sizes[0] !== sizes[sizes.length - 1] ? `${sizes[sizes.length - 1]}–${sizes[0]}` : sizes[0]}. Tap players to keep them together.
              </Text>

              {groups.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }} testID="pin-groups">
                  {groups.map((g, i) => (
                    <View key={g.join()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, borderRadius: theme.radius.full, backgroundColor: theme.colors.primarySoft, borderWidth: 1, borderColor: theme.colors.primary }}>
                      <Ionicons name="link" size={14} color={theme.colors.primaryText} />
                      <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm, color: theme.colors.primaryText }}>
                        {g.map(pid => byId.get(pid)?.first ?? '?').join(' + ')}
                      </Text>
                      <TouchableOpacity
                        onPress={() => changePins(removePinGroup(groups, i))}
                        accessibilityRole="button"
                        accessibilityLabel={`Stop keeping ${g.map(pid => byId.get(pid)?.first ?? '').join(' and ')} together`}
                        style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name="close" size={16} color={theme.colors.primaryText} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <View style={{ gap: 8 }}>
                {players.map(p => {
                  const on = selected.includes(p.id)
                  return (
                    <TouchableOpacity
                      key={p.id}
                      testID={`pin-player-${p.id}`}
                      onPress={() => setSelected(on ? selected.filter(x => x !== p.id) : [...selected, p.id])}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      aria-checked={on}
                      accessibilityLabel={`${p.name}${pinnedIds.has(p.id) ? ', kept with friends' : ''}`}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8,
                        borderRadius: theme.radius.lg, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: on ? theme.colors.primary : theme.colors.border,
                      }}
                    >
                      <View style={{ width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: on ? theme.colors.primary : theme.colors.border, backgroundColor: on ? theme.colors.primary : 'transparent' }}>
                        {on && <Ionicons name="checkmark" size={16} color={theme.colors.white} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.text }}>{p.name}</Text>
                        <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext }}>{p.line}</Text>
                      </View>
                      {pinnedIds.has(p.id) && <Ionicons name="link" size={18} color={theme.colors.primary} accessibilityElementsHidden importantForAccessibility="no" />}
                    </TouchableOpacity>
                  )
                })}
              </View>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 160 }}>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.subtext, marginBottom: 14 }}>
                {groups.length ? 'Pins kept. ' : ''}Tap two players on different teams to swap them. ★ = captain.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {draft.map(t => {
                  const level = soloTeamLevel(t.members, players)
                  return (
                    <View key={t.name} testID="drafted-team" style={{ flexGrow: 1, flexBasis: 160, padding: 12, borderRadius: theme.radius.lg, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                        <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.base, color: theme.colors.text }}>{t.name}</Text>
                        {level && <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext }}>avg {SKILL_LEVEL_LABELS[level]}</Text>}
                      </View>
                      <View style={{ gap: 4 }}>
                        {t.members.map(pid => {
                          const p = byId.get(pid)
                          const pinned = pinnedIds.has(pid)
                          const picked = swapFrom === pid
                          return (
                            <TouchableOpacity
                              key={pid}
                              onPress={() => tapDrafted(pid)}
                              disabled={pinned}
                              accessibilityRole="button"
                              accessibilityState={{ selected: picked, disabled: pinned }}
                              accessibilityLabel={`${p?.name ?? 'Player'}${t.captain === pid ? ', captain' : ''}${pinned ? ', kept with friends' : ''}`}
                              style={{
                                flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 8, borderRadius: theme.radius.sm,
                                backgroundColor: picked || pinned ? theme.colors.primarySoft : theme.colors.background,
                                borderWidth: 1, borderColor: picked ? theme.colors.primary : 'transparent',
                              }}
                            >
                              <Text numberOfLines={1} style={{ flex: 1, fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.smd, color: pinned ? theme.colors.primaryText : theme.colors.text }}>
                                {p?.first ?? 'Player'}{t.captain === pid ? ' ★' : ''}
                              </Text>
                              {!!p?.pos && <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext }}>{p.pos}</Text>}
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    </View>
                  )
                })}
              </View>
            </ScrollView>
          )}

          {/* Bottom actions */}
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: insets.bottom + 16, gap: 10, backgroundColor: theme.colors.background, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
            {!draft ? (
              <>
                {selected.length >= 2 && (
                  <Button label={`Keep these ${selected.length} together`} icon="link-outline" variant="secondary" onPress={keepTogether} testID="keep-together" />
                )}
                <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
                  <Chip label="Random" role="radio" active={mode === 'random'} onPress={() => setMode('random')} testID="shuffle-random" />
                  <Chip label="Balanced by level" role="radio" active={mode === 'balanced'} onPress={() => setMode('balanced')} testID="shuffle-balanced" />
                </View>
                <Button label="Shuffle teams" icon="shuffle-outline" onPress={shuffle} disabled={teamCount < 2} testID="shuffle-teams" />
              </>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Button label="Shuffle again" icon="shuffle-outline" variant="secondary" onPress={shuffle} testID="shuffle-again" /></View>
                <View style={{ flex: 1 }}><Button label="Post teams" onPress={() => setConfirmPost(true)} testID="post-teams" /></View>
              </View>
            )}
          </View>
        </ScreenState>
      </ScreenContainer>

      <ConfirmDialog
        visible={confirmPost}
        title={`Post ${draft?.length ?? 0} teams?`}
        body="Everyone signed up solo is placed on their team, and the teams show on the Teams tab. You can still move players there afterwards."
        confirmLabel="Post teams"
        loading={actions.postSoloTeams.isPending}
        onConfirm={() => { void post() }}
        onCancel={() => setConfirmPost(false)}
      />
    </View>
  )
}
