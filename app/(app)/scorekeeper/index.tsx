import { Pressable, ScrollView, View } from 'react-native'
import type { ReactNode } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Stack, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../../../components/ui/Text'
import { EmptyState, ScreenContainer, ScreenHeader } from '../../../components/ui'
import { Button } from '../../../components/Button'
import { MatchRow } from '../../../components/scoresheet/MatchRow'
import { SimpleScorePanel } from '../../../components/scoresheet/SimpleScorePanel'
import { useUrlParam } from '../../../hooks/useUrlParam'
import { VIEW } from '../../../utils/urlViews'
import { useSavedMatches } from '../../../hooks/useSavedMatches'
import { openExampleMatch } from '../../../hooks/useScoreMatch'
import { shared, theme } from '../../../constants'
import { routes } from '../../../utils/routes'

const MODES = [
  { id: 'simple', label: 'Simple' },
  { id: 'official', label: 'Official (NAGVA)' },
] as const

/**
 * Scorekeeper home: a Simple | Official switch (`?mode=`). Simple is the plain point counter, right
 * here; Official is the USAV scoresheet with the NAGVA setups: matches saved on this device
 * (in progress first), "New match" and the example.
 */
export default function ScorekeeperScreen() {
  const router = useRouter()
  const [mode, setMode] = useUrlParam('mode', VIEW.scorekeeper.mode)
  const top: ReactNode = (
    <>
      <ScreenHeader safeTop kicker="Experimental" title="Scorekeeper" onBack={() => (router.canGoBack() ? router.back() : router.replace(routes.settings('experimental')))} />
      <View style={shared.segments} role="tablist">
        {MODES.map(m => (
          <Pressable
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            onPress={() => setMode(m.id)}
            style={[shared.segment, mode === m.id && shared.segmentOn]}
            testID={`scorekeeper-mode-${m.id}`}
          >
            <Text style={[shared.segmentText, mode === m.id && shared.segmentTextOn]} numberOfLines={1}>{m.label}</Text>
          </Pressable>
        ))}
      </View>
    </>
  )
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {mode === 'simple' ? <SimpleScorePanel top={top} /> : <OfficialHome top={top} />}
    </>
  )
}

function OfficialHome({ top }: { top: ReactNode }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { matches } = useSavedMatches()
  const live = (matches ?? []).filter(m => m.status === 'live')
  const done = (matches ?? []).filter(m => m.status === 'final')

  return (
    <View style={shared.screen}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.xxl }}>
        <ScreenContainer>
          {top}
          <Text style={[shared.body, { color: theme.colors.subtextStrong, marginTop: theme.spacing.md }]}>
            Lineups, rotations, subs and time-outs, with the official USA Volleyball scoresheet filled in. New match has NAGVA pool play and bracket setups. Every tap is saved on this device, so you can close the app and pick up where you left off.
          </Text>
          <Button label="New match" icon="add" onPress={() => router.push(routes.scorekeeperNew())} style={{ marginTop: theme.spacing.lg }} testID="new-match" />
          <Pressable
            onPress={() => void openExampleMatch().then(id => router.push(routes.scorekeeperSheet(id)))}
            accessibilityRole="button"
            accessibilityLabel="See what you get: open a finished example match"
            testID="open-example"
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
              shared.card,
              { marginTop: theme.spacing.md, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
              (pressed || hovered) && { borderColor: theme.colors.primary },
            ]}
          >
            <View style={{ width: 44, height: 44, borderRadius: theme.radius.md, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="document-text-outline" size={22} color={theme.colors.timeInk} />
            </View>
            <View style={{ flex: 1, gap: theme.spacing.xs }}>
              <Text style={shared.subheading}>See what you get</Text>
              <Text style={[shared.body, { color: theme.colors.subtextStrong }]}>
                Open a finished example match: the scoresheet, the official USA Volleyball form filled in, and Copy to paper.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.subtext} />
          </Pressable>

          {live.length > 0 && (
            <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.sm }}>
              <Text style={shared.label}>In progress</Text>
              {live.map(m => <MatchRow key={m.id} match={m} highlight onPress={() => router.push(routes.scorekeeperMatch(m.id))} />)}
            </View>
          )}
          {done.length > 0 && (
            <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.sm }}>
              <Text style={shared.label}>Finished</Text>
              {done.map(m => <MatchRow key={m.id} match={m} onPress={() => router.push(routes.scorekeeperMatch(m.id))} />)}
            </View>
          )}
          {matches && matches.length === 0 && (
            <View style={{ marginTop: theme.spacing.xl }}>
              <EmptyState icon="clipboard-outline" title="No matches yet" body="Start one when the teams are warming up." />
            </View>
          )}
        </ScreenContainer>
      </ScrollView>
    </View>
  )
}
