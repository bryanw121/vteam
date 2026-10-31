import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'
import { Text } from '../../../components/ui/Text'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { theme } from '../../../constants'
import { TOURNAMENT_TABS } from '../../../constants/tournamentCopy'
import type { TournamentTabName } from '../../../types'
import { useSession } from '../../../contexts/session'
import { useRequireSignIn } from '../../../hooks/useRequireSignIn'
import { notifyInfo } from '../../../utils/notify'
import { useTournamentActions } from '../../../hooks/tournament/useTournamentActions'
import { useTournamentData } from '../../../hooks/tournament/useTournamentData'
import { RefreshControl } from '../../../components/RefreshControl'
import { generateSchedule, nextStageStart, scheduleBracket } from '../../../lib/tournamentSchedule'
import { generateBracket } from '../../../lib/tournamentBracket'
import { avoidPoolRematches, computeStandings, seedsFromPools } from '../../../lib/tournamentStandings'
import { poolTables as buildPoolTables, resultWrites, tournamentPodium } from '../../../lib/tournamentResults'
import { profileDisplayName } from '../../../utils'
import { routes } from '../../../utils/routes'
import { ConfirmDialog, ScreenHeader, ScreenState } from '../../../components/ui'
import { DiscussionTab } from '../../../components/tournament/DiscussionTab'
import { MatchResultSheet } from '../../../components/tournament/MatchResultSheet'
import { ResultsTab } from '../../../components/tournament/ResultsTab'
import { SeedSheet } from '../../../components/tournament/SeedSheet'
import { InviteModal } from '../../../components/tournament/InviteModal'
import { OverviewTab } from '../../../components/tournament/OverviewTab'
import { ScheduleTab } from '../../../components/tournament/ScheduleTab'
import type { TeamCardActions } from '../../../types'
import { TeamsTab } from '../../../components/tournament/TeamsTab'
import { TournamentHero } from '../../../components/tournament/TournamentHero'
import {
  AnnouncementSheet, JoinRequestSheet, PickTeamSheet, PrizeSheet, RegisterSheet,
} from '../../../components/tournament/TournamentSheets'
import type { TournamentTeamWithRoster } from '../../../types'
import type { ScheduleConfig, SetScore, TournamentCommentWithAuthor, TournamentConfirm, TournamentMatchRow } from '../../../types'

const EMPTY_COMMENTS: TournamentCommentWithAuthor[] = []

type MovingPlayer = { userId: string; fromTeamId: string; playerName: string }

export default function TournamentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { userId } = useSession()
  const requireSignIn = useRequireSignIn()

  const [activeTab, setActiveTab] = useState<TournamentTabName>('Overview')
  // Matches and pools are only needed once the Schedule or Results tab has been opened.
  const wantsMatches = activeTab === 'Schedule' || activeTab === 'Results'
  const [scheduleOpened, setScheduleOpened] = useState(false)
  useEffect(() => { if (wantsMatches) setScheduleOpened(true) }, [wantsMatches])

  const {
    core, teams: teamsQ, comments: commentsQ, mine, matches: matchesQ, pools: poolsQ, mentionableUsers,
    loadEarlierComments, loadingEarlierComments,
  } = useTournamentData(
    id, userId, { loadMatches: scheduleOpened || wantsMatches },
  )
  const actions = useTournamentActions(id, userId)

  // Pull-to-refresh on every tab: one parallel round (disabled queries are no-ops).
  const [refreshing, setRefreshing] = useState(false)
  const refreshAll = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([core, teamsQ, commentsQ, mine, matchesQ, poolsQ].map(q => q.refetch({ force: true })))
    } finally {
      setRefreshing(false)
    }
  }, [core, teamsQ, commentsQ, mine, matchesQ, poolsQ])
  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={() => { void refreshAll() }} tintColor={theme.colors.primary} />

  // ── UI state ───────────────────────────────────────────────────────────────
  const [showRegister, setShowRegister] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [invitingId, setInvitingId] = useState<string | null>(null)
  const [acceptingInviteId, setAcceptingInviteId] = useState<string | null>(null)
  const [requestingTeam, setRequestingTeam] = useState<TournamentTeamWithRoster | null>(null)
  const [assigningFreeAgent, setAssigningFreeAgent] = useState<TournamentTeamWithRoster | null>(null)
  const [movingPlayer, setMovingPlayer] = useState<MovingPlayer | null>(null)
  const [showPrize, setShowPrize] = useState(false)
  const [showAnnouncement, setShowAnnouncement] = useState(false)
  const [confirm, setConfirm] = useState<TournamentConfirm | null>(null)
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig | null>(null)
  const [resultMatch, setResultMatch] = useState<TournamentMatchRow | null>(null)
  const [showSeeds, setShowSeeds] = useState(false)

  // ── Derived ────────────────────────────────────────────────────────────────
  const tournament = core.data?.tournament ?? null
  const rules = core.data?.rules ?? null
  const prizes = core.data?.prizes ?? []
  const teams = teamsQ.data ?? []
  const comments = commentsQ.data?.rows ?? EMPTY_COMMENTS
  const myTeam = mine.data?.team ?? null
  const isCreator = !!(userId && tournament?.created_by === userId)
  const registrationOpen = !!tournament
    && tournament.status === 'published'
    && (!tournament.registration_deadline || new Date(tournament.registration_deadline) > new Date())
  const announcements = comments.filter(c => c.is_announcement && !c.deleted_at)
  const registeredTeams = teams.filter(t => t.status === 'registered')

  const config: ScheduleConfig = scheduleConfig ?? {
    numCourts: tournament?.num_courts ?? 1,
    matchDuration: tournament?.match_duration_minutes ?? 45,
    breakDuration: tournament?.break_duration_minutes ?? 10,
    gamesPerTeam: null,
    teamsPerPool: null,
    restBetweenMatches: true,
  }

  // ── Results (pure, from the cached rows) ───────────────────────────────────
  const matches = useMemo(() => matchesQ.data ?? [], [matchesQ.data])
  const pools = useMemo(() => poolsQ.data ?? [], [poolsQ.data])
  const teamName = useCallback((tid: string | null) => teams.find(t => t.id === tid)?.name ?? 'TBD', [teams])
  const results = useMemo(() => {
    if (!tournament) return null
    const registeredIds = teams.filter(t => t.status === 'registered').map(t => t.id)
    const poolStage = matches.filter(m => m.stage === 'pool_play')
    const tables = tournament.format === 'pool_play' || tournament.format === 'pool_bracket' ? buildPoolTables(pools, poolStage) : []
    const overall = tournament.format === 'round_robin' ? computeStandings(registeredIds, matches) : null
    const bracketRows = matches.filter(m => m.stage === 'bracket')
    const bracketPlayed = bracketRows.some(m => !!m.winner_id)

    let seedPreview: { teamId: string; label: string }[] | null = null
    if (isCreator && tournament.format === 'pool_bracket' && tables.length > 0 && !bracketPlayed && tournament.status !== 'completed') {
      const poolOf = new Map<string, string>()
      const tierOf = new Map<string, number>()
      const label = new Map<string, string>()
      for (const t of tables) t.rows.forEach((r, i) => { poolOf.set(r.teamId, t.poolKey); tierOf.set(r.teamId, i); label.set(r.teamId, `${t.name} #${i + 1}`) })
      const seeds = avoidPoolRematches(seedsFromPools(tables, tournament.teams_advance_per_pool), poolOf, tierOf)
      seedPreview = seeds.map(teamId => ({ teamId, label: label.get(teamId) ?? '' }))
    }
    return {
      tables,
      overall,
      podium: tournamentPodium(matches, tournament, registeredIds),
      seedPreview,
      poolMatchesLeft: poolStage.filter(m => !m.winner_id).length,
      bracketExists: bracketRows.length > 0,
    }
  }, [tournament, teams, matches, pools, isCreator])

  const goBack = () => (router.canGoBack() ? router.back() : router.replace(routes.app()))

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function submitRegister(v: { name: string; freeAgent: boolean }): Promise<boolean> {
    if (!userId) return false
    const name = v.freeAgent ? `Free Agent - ${userId.slice(0, 6)}` : v.name
    const done = await actions.register.mutate({ name, freeAgent: v.freeAgent })
    if (done) setShowRegister(false)
    return !!done
  }

  async function acceptInvite(inviteId: string) {
    setAcceptingInviteId(inviteId)
    await actions.acceptInvite.mutate(inviteId)
    setAcceptingInviteId(null)
  }

  async function sendInvite(inviteeId: string) {
    if (!myTeam) return
    setInvitingId(inviteeId)
    await actions.sendInvite.mutate({ teamId: myTeam.id, inviteeId })
    setInvitingId(null)
  }

  async function sendJoinRequest(team: TournamentTeamWithRoster) {
    const done = await actions.sendJoinRequest.mutate(team.id)
    if (done) setRequestingTeam(null)
  }

  async function runConfirmed() {
    const c = confirm
    if (!c) return
    if (c.kind === 'withdraw' && myTeam) await actions.withdraw.mutate(myTeam.id)
    else if (c.kind === 'removeTeam') await actions.removeTeam.mutate(c.teamId)
    else if (c.kind === 'deleteComment') await actions.deleteComment.mutate(c.commentId)
    else if (c.kind === 'seedBracket') await seedBracket()
    setConfirm(null)
  }

  async function generate(): Promise<boolean> {
    if (!tournament) return false
    if (registeredTeams.length < 2) {
      notifyInfo('Not enough teams', 'Need at least 2 registered teams to generate a schedule.')
      return false
    }
    const schedule = generateSchedule({
      format: tournament.format,
      startDate: new Date(tournament.start_date),
      teamIds: registeredTeams.map(t => t.id),
      seeds: Object.fromEntries(registeredTeams.map(t => [t.id, t.seed])),
      refs: tournament.has_refs,
      bracketType: tournament.bracket_type ?? 'single',
      config,
    })
    return !!(await actions.replaceSchedule.mutate(schedule))
  }

  async function seedBracket() {
    if (!tournament || !results?.seedPreview) return
    const rows = generateBracket(results.seedPreview.map(s => s.teamId), tournament.bracket_type ?? 'single')
    const start = nextStageStart(matches.filter(m => m.stage === 'pool_play').map(m => m.scheduled_at), config, new Date(tournament.start_date))
    await actions.seedBracket.mutate(scheduleBracket(rows, start, config))
  }

  async function submitResult(v: { winnerId: string; sets: SetScore[]; forfeit: boolean }): Promise<boolean> {
    if (!tournament || !resultMatch) return false
    const writes = resultWrites({ match: resultMatch, winnerId: v.winnerId, matches, tournament, teamIds: registeredTeams.map(t => t.id) })
    if (writes.blocked) {
      notifyInfo('Result not saved', writes.blocked)
      return false
    }
    const done = await actions.recordResult.mutate({ matchId: resultMatch.id, ...v, writes })
    if (done) {
      setResultMatch(null)
      if (writes.nextStatus === 'completed') notifyInfo('Tournament complete', 'Final results are in. The podium is on the Results tab.')
    }
    return !!done
  }

  async function pickForFreeAgent(target: TournamentTeamWithRoster) {
    const fa = assigningFreeAgent
    const memberId = fa?.members[0]?.user_id
    if (!fa || !memberId) return
    const done = await actions.assignFreeAgent.mutate({ freeAgentTeamId: fa.id, userId: memberId, targetTeamId: target.id })
    if (done) setAssigningFreeAgent(null)
  }

  async function pickForMovingPlayer(target: TournamentTeamWithRoster) {
    if (!movingPlayer) return
    const done = await actions.movePlayer.mutate({ fromTeamId: movingPlayer.fromTeamId, userId: movingPlayer.userId, toTeamId: target.id })
    if (done) setMovingPlayer(null)
  }

  const teamActions: TeamCardActions = {
    onInvite: () => setShowInvite(true),
    onMovePlayer: setMovingPlayer,
    onApprove: teamId => { void actions.approveTeam.mutate(teamId) },
    onMarkPaid: teamId => { void actions.markPaid.mutate(teamId) },
    onRemove: (teamId, teamName) => setConfirm({ kind: 'removeTeam', teamId, teamName }),
    onAssign: setAssigningFreeAgent,
    onRequestJoin: team => { if (requireSignIn()) setRequestingTeam(team) },
    onApproveRequest: req => {
      void actions.approveJoinRequest.mutate({ requestId: req.id, requesterId: req.requester_id, teamId: req.team_id })
    },
    onDeclineRequest: requestId => { void actions.declineJoinRequest.mutate(requestId) },
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const confirmCopy = (() => {
    if (!confirm) return { title: '', body: '', label: '' }
    if (confirm.kind === 'withdraw') return { title: 'Withdraw?', body: `Remove "${myTeam?.name ?? 'your team'}" from the tournament?`, label: 'Withdraw' }
    if (confirm.kind === 'removeTeam') return { title: 'Remove team?', body: `Remove "${confirm.teamName}" from the tournament?`, label: 'Remove' }
    if (confirm.kind === 'seedBracket') {
      return {
        title: results?.bracketExists ? 'Reseed the bracket?' : 'Create the bracket?',
        body: `${results?.seedPreview?.length ?? 0} teams go into the bracket in the order shown.${results?.poolMatchesLeft ? ' Some pool matches have no result yet.' : ''}`,
        label: results?.bracketExists ? 'Reseed' : 'Create',
      }
    }
    return { title: 'Delete?', body: 'Remove this comment?', label: 'Delete' }
  })()
  const confirmBusy = actions.withdraw.isPending || actions.removeTeam.isPending || actions.deleteComment.isPending || actions.seedBracket.isPending

  const notFound = !!core.data && !core.data.tournament
  const showBackHeader = notFound || (!!core.error && !core.data)

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      {showBackHeader && <ScreenHeader title="Tournament" safeTop onBack={goBack} />}

      <ScreenState
        loading={core.isLoading}
        ready={!!core.data}
        error={!!core.error}
        onRetry={() => { void core.refetch({ force: true }) }}
        empty={notFound}
        emptyIcon="trophy-outline"
        emptyTitle="Tournament not found"
        emptyBody="It may have been removed, or it isn't visible to you."
      >
        {tournament && (
          <>
            <TournamentHero tournament={tournament} registeredTeamCount={registeredTeams.length} onBack={goBack} />

            {/* Tab bar: scrolls sideways when five labels don't fit (narrow phones), spreads out otherwise. */}
            <View style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.background }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                accessibilityRole="tablist"
                contentContainerStyle={{ flexGrow: 1 }}
              >
                {TOURNAMENT_TABS.map(tab => (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: activeTab === tab }}
                    testID={`tournament-tab-${tab.toLowerCase()}`}
                    style={{
                      flexGrow: 1, paddingVertical: 13, paddingHorizontal: 12, alignItems: 'center',
                      borderBottomWidth: 2.5,
                      borderBottomColor: activeTab === tab ? theme.colors.primary : 'transparent',
                    }}
                  >
                    <Text style={{
                      fontFamily: activeTab === tab ? theme.fonts.bodySemiBold : theme.fonts.body,
                      fontSize: theme.font.size.smd,
                      color: activeTab === tab ? theme.colors.text : theme.colors.subtext,
                    }}>{tab}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {activeTab === 'Overview' && (
              <OverviewTab
                refreshControl={refreshControl}
                tournament={tournament}
                rules={rules}
                prizes={prizes}
                teams={teams}
                myTeam={myTeam}
                invites={mine.data?.invites ?? []}
                announcements={announcements}
                isCreator={isCreator}
                registrationOpen={registrationOpen}
                withdrawing={actions.withdraw.isPending}
                publishing={actions.publishTournament.isPending}
                acceptingInviteId={acceptingInviteId}
                onGoToTeams={() => setActiveTab('Teams')}
                onWithdraw={() => setConfirm({ kind: 'withdraw' })}
                onRegister={() => { if (requireSignIn()) setShowRegister(true) }}
                onAcceptInvite={inviteId => { void acceptInvite(inviteId) }}
                onDeclineInvite={inviteId => { void actions.declineInvite.mutate(inviteId) }}
                onAddAnnouncement={() => setShowAnnouncement(true)}
                onAddPrize={() => setShowPrize(true)}
                onDeletePrize={prizeId => { void actions.deletePrize.mutate(prizeId) }}
                onPublish={() => { void actions.publishTournament.mutate() }}
              />
            )}

            {activeTab === 'Teams' && (
              <TeamsTab
                refreshControl={refreshControl}
                teams={teams}
                myTeam={myTeam}
                viewerId={userId}
                isCreator={isCreator}
                registrationOpen={registrationOpen}
                joinRequests={mine.data?.joinRequests ?? []}
                actions={teamActions}
                onSetSeeds={() => setShowSeeds(true)}
              />
            )}

            {activeTab === 'Schedule' && (
              <ScheduleTab
                refreshControl={refreshControl}
                tournament={tournament}
                teams={teams}
                matches={matchesQ.data ?? []}
                matchesLoading={matchesQ.isLoading}
                matchesError={!!matchesQ.error}
                onRetryMatches={() => { void matchesQ.refetch({ force: true }) }}
                myTeam={myTeam}
                isCreator={isCreator}
                config={config}
                onConfigChange={setScheduleConfig}
                generating={actions.replaceSchedule.isPending}
                onGenerate={generate}
                publishing={actions.publishSchedule.isPending}
                onPublishSchedule={() => { void actions.publishSchedule.mutate() }}
                savingMatch={actions.saveMatch.isPending}
                onSaveMatch={async (matchId, scheduledAt, court, teamAId, teamBId) =>
                  !!(await actions.saveMatch.mutate({ matchId, scheduledAt, court, teamAId, teamBId }))}
                poolName={pid => pools.find(pl => pl.id === pid)?.name ?? null}
                onRecordResult={setResultMatch}
              />
            )}

            {activeTab === 'Results' && results && (
              <ResultsTab
                refreshControl={refreshControl}
                tournament={tournament}
                matches={matches}
                loading={matchesQ.isLoading || poolsQ.isLoading}
                error={!!matchesQ.error || !!poolsQ.error}
                onRetry={() => { void matchesQ.refetch({ force: true }); void poolsQ.refetch({ force: true }) }}
                teamName={teamName}
                myTeam={myTeam}
                isCreator={isCreator}
                poolTables={results.tables}
                overall={results.overall}
                podium={results.podium}
                seedPreview={results.seedPreview}
                poolMatchesLeft={results.poolMatchesLeft}
                bracketExists={results.bracketExists}
                seeding={actions.seedBracket.isPending}
                onSeedBracket={() => setConfirm({ kind: 'seedBracket' })}
                onPressMatch={isCreator ? setResultMatch : undefined}
              />
            )}

            {activeTab === 'Discussion' && (
              <DiscussionTab
                refreshControl={refreshControl}
                comments={comments}
                hasEarlier={commentsQ.data?.hasEarlier ?? false}
                loadingEarlier={loadingEarlierComments}
                onLoadEarlier={() => { void loadEarlierComments() }}
                loading={commentsQ.isLoading}
                error={!!commentsQ.error}
                onRetry={() => { void commentsQ.refetch({ force: true }) }}
                viewerId={userId}
                isCreator={isCreator}
                mentionableUsers={mentionableUsers}
                onPost={actions.postComment}
                onRequestDelete={commentId => setConfirm({ kind: 'deleteComment', commentId })}
              />
            )}

            {/* ── Sheets and dialogs ──────────────────────────────────────────── */}
            <RegisterSheet
              visible={showRegister}
              onDismiss={() => setShowRegister(false)}
              tournament={tournament}
              full={tournament.max_teams !== null && registeredTeams.length >= tournament.max_teams}
              busy={actions.register.isPending}
              onSubmit={submitRegister}
            />

            <InviteModal
              visible={showInvite}
              onClose={() => setShowInvite(false)}
              viewerId={userId}
              teams={teams}
              invitingId={invitingId}
              onInvite={inviteeId => { void sendInvite(inviteeId) }}
            />

            <JoinRequestSheet
              team={requestingTeam}
              onDismiss={() => setRequestingTeam(null)}
              busy={actions.sendJoinRequest.isPending}
              onSend={team => { void sendJoinRequest(team) }}
            />

            <PickTeamSheet
              visible={!!assigningFreeAgent}
              title="Assign to Team"
              subtitle={`Move ${assigningFreeAgent?.members[0]?.profiles ? profileDisplayName(assigningFreeAgent.members[0].profiles) : 'free agent'} to:`}
              teams={registeredTeams}
              onPick={team => { void pickForFreeAgent(team) }}
              onDismiss={() => setAssigningFreeAgent(null)}
            />

            <PickTeamSheet
              visible={!!movingPlayer}
              title="Move Player"
              subtitle={`Move ${movingPlayer?.playerName ?? 'player'} to:`}
              teams={registeredTeams.filter(t => t.id !== movingPlayer?.fromTeamId)}
              onPick={team => { void pickForMovingPlayer(team) }}
              onDismiss={() => setMovingPlayer(null)}
            />

            <PrizeSheet
              visible={showPrize}
              onDismiss={() => setShowPrize(false)}
              busy={actions.addPrize.isPending}
              onSubmit={async v => {
                const done = await actions.addPrize.mutate({ ...v, displayOrder: prizes.length })
                if (done) setShowPrize(false)
                return !!done
              }}
            />

            <AnnouncementSheet
              visible={showAnnouncement}
              onDismiss={() => setShowAnnouncement(false)}
              busy={actions.postAnnouncement.isPending}
              onSubmit={async body => {
                const done = await actions.postAnnouncement.mutate(body)
                if (done) setShowAnnouncement(false)
                return !!done
              }}
            />

            <MatchResultSheet
              match={resultMatch}
              teamName={teamName}
              setsToWin={rules?.sets_to_win ?? 2}
              busy={actions.recordResult.isPending}
              onDismiss={() => setResultMatch(null)}
              onSubmit={submitResult}
            />

            <SeedSheet
              visible={showSeeds}
              teams={registeredTeams}
              busy={actions.saveSeeds.isPending}
              onDismiss={() => setShowSeeds(false)}
              onSave={async seeds => !!(await actions.saveSeeds.mutate(seeds))}
            />

            <ConfirmDialog
              visible={!!confirm}
              title={confirmCopy.title}
              body={confirmCopy.body}
              confirmLabel={confirmCopy.label}
              destructive={confirm?.kind !== 'seedBracket'}
              loading={confirmBusy}
              onConfirm={() => { void runConfirmed() }}
              onCancel={() => setConfirm(null)}
            />
          </>
        )}
      </ScreenState>
    </View>
  )
}
