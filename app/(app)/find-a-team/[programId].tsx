import React, { useEffect, useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../../../components/ui/Text'
import { Chip, EmptyState, ScreenContainer, ScreenHeader, ScreenState } from '../../../components/ui'
import { Button } from '../../../components/Button'
import { SignInPrompt } from '../../../components/SignInPrompt'
import { ReportSheet } from '../../../components/ReportSheet'
import { FreeAgentRow } from '../../../components/programs/FreeAgentRow'
import { FreeAgentSheet } from '../../../components/programs/FreeAgentSheet'
import { useSession } from '../../../contexts/session'
import { useRequireSignIn } from '../../../hooks/useRequireSignIn'
import { useExternalProgram } from '../../../hooks/useExternalPrograms'
import { useFreeAgentActions, useFreeAgentCounts, useFreeAgents } from '../../../hooks/useFreeAgents'
import { useMyProfile } from '../../../hooks/useMyProfile'
import { useOpenDm } from '../../../hooks/useOpenDm'
import { useToday } from '../../../hooks/useToday'
import { useUrlParam } from '../../../hooks/useUrlParam'
import { openExternalUrl } from '../../../lib/openExternalUrl'
import { track } from '../../../lib/analytics'
import { ANALYTICS_EVENTS } from '../../../constants/analytics'
import { shared, theme } from '../../../constants'
import { routes } from '../../../utils/routes'
import { VIEW } from '../../../utils/urlViews'
import { programKicker, programWhen } from '../../../utils/externalPrograms'
import { draftFrom, FREE_AGENT_POSITIONS, FREE_AGENT_WANTS, takesFreeAgents, visibleFreeAgents } from '../../../utils/freeAgents'
import { profileDisplayName } from '../../../utils'
import type { FreeAgent } from '../../../types'

/**
 * Find a team for an outside tournament or league (#304): who's looking for a team or a
 * partner, with Message. Public route: guests see how many are looking and sign in to see who.
 */
export default function FindATeamScreen() {
  const { programId = '' } = useLocalSearchParams<{ programId: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const today = useToday()
  const { userId, isGuest } = useSession()
  const requireSignIn = useRequireSignIn()
  const { program, isLoading, error, refetch } = useExternalProgram(programId)
  const list = useFreeAgents(programId)
  const counts = useFreeAgentCounts(isGuest && programId ? [programId] : [])
  const { profile: me } = useMyProfile({ enabled: !isGuest })
  const actions = useFreeAgentActions(programId)
  const { openDm } = useOpenDm()
  const [pos, setPos] = useUrlParam('pos', VIEW.findATeam.pos)
  const [want, setWant] = useUrlParam('want', VIEW.findATeam.want)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [reporting, setReporting] = useState<FreeAgent | null>(null)
  const [messaging, setMessaging] = useState<string | null>(null)

  useEffect(() => { track(ANALYTICS_EVENTS.findATeamOpened, { signed_in: !isGuest }) }, [isGuest])

  const agents = list.data ?? []
  const mine = agents.find(a => a.user_id === userId) ?? null
  const shown = useMemo(() => visibleFreeAgents(agents, { pos, want }, userId), [agents, pos, want, userId])
  const initialDraft = useMemo(() => draftFrom(mine, me?.position), [mine, me?.position])
  const open = !!program && takesFreeAgents(program, today)

  const back = () => (router.canGoBack() ? router.back() : router.replace(routes.tournaments()))
  const startLooking = () => { if (requireSignIn()) setSheetOpen(true) }
  const message = async (a: FreeAgent) => {
    track(ANALYTICS_EVENTS.freeAgentMessaged, {})
    setMessaging(a.user_id)
    try { await openDm(a.user_id) } finally { setMessaging(null) }
  }

  const signup = program?.signup_url ? (
    <View style={[shared.freeAgentFooter, { paddingBottom: Math.max(insets.bottom, theme.spacing.md) }]}>
      <Button
        label={`Sign up with ${program.org}`}
        icon="open-outline"
        variant="secondary"
        onPress={() => {
          track(ANALYTICS_EVENTS.outsideLinkOpened, { kind: program.kind, org: program.org })
          void openExternalUrl(program.signup_url!)
        }}
        testID="find-a-team-signup"
      />
    </View>
  ) : null

  return (
    <View style={shared.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: theme.spacing.xxl }}>
        <ScreenContainer>
          <ScreenHeader safeTop kicker={program ? programKicker(program) : 'Find a team'} title={program?.title ?? 'Find a team'} onBack={back} />
          <ScreenState
            loading={isLoading && !program}
            ready={!!program}
            error={error && !program ? "Couldn't load this tournament." : null}
            onRetry={() => { void refetch({ force: true }) }}
            empty={!isLoading && !program}
            emptyIcon="calendar-outline"
            emptyTitle="Not listed anymore"
            emptyBody="Its sign-up closed or it has ended, so its Find a team list is gone too."
          >
            {program && (
              <View style={{ gap: theme.spacing.md }}>
                <Text style={shared.caption}>{programWhen(program)}</Text>
                {!open ? (
                  <EmptyState icon="flag-outline" title="This one has ended" body="Find a team is open until the last day." />
                ) : isGuest ? (
                  <SignInPrompt
                    icon="people-outline"
                    title={counts?.get(programId) ? `${counts.get(programId)} looking for a team` : 'Find teammates here'}
                    body="Sign in to see who's looking, message them, or add yourself."
                  />
                ) : (
                  <>
                    {mine ? (
                      <View style={[shared.card, shared.freeAgentMine, { marginHorizontal: 0 }]} testID="free-agent-mine">
                        <Text style={shared.subheading}>You're on the list</Text>
                        <Text style={shared.caption}>Signed-in players can message you until {program.ends_on ?? program.starts_on ?? 'it ends'}.</Text>
                      </View>
                    ) : (
                      <View style={[shared.card, { marginHorizontal: 0, gap: theme.spacing.sm }]}>
                        <Text style={shared.subheading}>Need a team, a partner or players?</Text>
                        <Text style={shared.caption}>Put yourself on the list, or message someone below.</Text>
                        <Button label="I'm looking" icon="hand-right-outline" onPress={startLooking} testID="free-agent-start" />
                      </View>
                    )}

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                      <Chip label={`All ${agents.length}`} role="radio" active={pos === 'any'} onPress={() => setPos('any')} testID="free-agent-filter-any" />
                      {FREE_AGENT_POSITIONS.map(p => (
                        <Chip key={p.key} label={p.label} role="radio" active={pos === p.key} onPress={() => setPos(pos === p.key ? 'any' : p.key)} testID={`free-agent-filter-${p.key}`} />
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                      {FREE_AGENT_WANTS.map(w => (
                        <Chip key={w.key} label={w.label} variant="tint" role="radio" active={want === w.key} onPress={() => setWant(want === w.key ? 'any' : w.key)} testID={`free-agent-want-filter-${w.key}`} />
                      ))}
                    </View>

                    <ScreenState
                      loading={list.isLoading}
                      ready={!!list.data}
                      error={list.error && !list.data ? "Couldn't load the list." : null}
                      onRetry={() => { void list.refetch({ force: true }) }}
                      empty={shown.length === 0}
                      emptyIcon="people-outline"
                      emptyTitle={agents.length ? 'Nobody matches' : 'Nobody yet'}
                      emptyBody={agents.length ? 'Try another position.' : 'Be the first: other players can then find you here.'}
                    >
                      <View testID="free-agent-list">
                        {shown.map(a => (
                          <FreeAgentRow
                            key={a.id}
                            agent={a}
                            mine={a.user_id === userId}
                            messaging={messaging === a.user_id}
                            onMessage={() => { void message(a) }}
                            onReport={() => setReporting(a)}
                            onEdit={() => setSheetOpen(true)}
                          />
                        ))}
                      </View>
                    </ScreenState>
                  </>
                )}
                {signup}
              </View>
            )}
          </ScreenState>
        </ScreenContainer>
      </ScrollView>

      {program && (
        <FreeAgentSheet
          visible={sheetOpen}
          programTitle={program.title}
          initial={initialDraft}
          editing={!!mine}
          saving={actions.save.isPending}
          onSave={draft => { void actions.save.mutate({ draft, id: mine?.id ?? null }).then(() => setSheetOpen(false)) }}
          onRemove={() => { if (mine) void actions.remove.mutate(mine.id).then(() => setSheetOpen(false)) }}
          onDismiss={() => setSheetOpen(false)}
        />
      )}
      {reporting && (
        <ReportSheet
          visible
          onDismiss={() => setReporting(null)}
          target={{ id: reporting.user_id, name: reporting.profiles ? profileDisplayName(reporting.profiles) : 'Player' }}
          kind="profile"
          contextId={null}
        />
      )}
    </View>
  )
}
