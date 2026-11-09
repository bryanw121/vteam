import React, { useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Text } from '../../components/ui/Text'
import { Stack, useRouter } from 'expo-router'
import { shared, theme } from '../../constants'
import { RefreshControl } from '../../components/RefreshControl'
import { ScreenContainer, ScreenHeader, ScreenState } from '../../components/ui'
import { ProgramSection } from '../../components/programs/ProgramSection'
import { useExternalPrograms } from '../../hooks/useExternalPrograms'
import { useToday } from '../../hooks/useToday'
import { programUrgency } from '../../utils/externalPrograms'
import { routes } from '../../utils/routes'
import { PROGRAMS_SOURCE_NOTE } from '../../constants/copy'

/**
 * Leagues around town open for sign-up, from Schelagg's programs feed (ACES, Austin Sports &
 * Social Club, Meanwhile, Reclub…): soonest deadline first, each linking to the organizer's
 * sign-up. Guests see it too. No RSVP here: these aren't vteam events.
 */
export default function LeaguesScreen() {
  const router = useRouter()
  const today = useToday()
  const programs = useExternalPrograms()
  const [refreshing, setRefreshing] = useState(false)
  const leagues = programs.data?.leagues ?? []

  const groups = useMemo(() => {
    const open = leagues.filter(p => p.status === 'open' || p.status === 'waitlist' || p.status == null)
    const soon = open.filter(p => programUrgency(p, today))
    return { soon, open: open.filter(p => !soon.includes(p)), later: leagues.filter(p => !open.includes(p)) }
  }, [leagues, today])

  async function refresh() {
    setRefreshing(true)
    try { await programs.refetch({ force: true }) } finally { setRefreshing(false) }
  }

  return (
    <View style={shared.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenContainer>
        <ScreenHeader title="Leagues" safeTop onBack={() => (router.canGoBack() ? router.back() : router.replace(routes.app()))} />
        <ScreenState
          loading={programs.isLoading}
          ready={!!programs.data}
          error={programs.error && !programs.data ? "Couldn't load leagues." : null}
          onRetry={() => { void programs.refetch({ force: true }) }}
          empty={leagues.length === 0}
          emptyIcon="calendar-outline"
          emptyTitle="No leagues open for sign-up"
          emptyBody="Organizers post new seasons every month or two. This checks their sign-up pages twice a day."
        >
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} tintColor={theme.colors.primary} />}
          >
            <ProgramSection title="Closing this week" programs={groups.soon} hot testID="leagues-soon" />
            <ProgramSection title="Open" programs={groups.open} testID="leagues-open" />
            <ProgramSection title="Not open yet, full or closed" programs={groups.later} testID="leagues-later" />
            <Text style={[shared.caption, { marginTop: theme.spacing.lg }]}>{PROGRAMS_SOURCE_NOTE}</Text>
          </ScrollView>
        </ScreenState>
      </ScreenContainer>
    </View>
  )
}
