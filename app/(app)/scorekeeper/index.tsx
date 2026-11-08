import { ScrollView, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../../../components/ui/Text'
import { EmptyState, ScreenContainer, ScreenHeader } from '../../../components/ui'
import { Button } from '../../../components/Button'
import { MatchRow } from '../../../components/scoresheet/MatchRow'
import { useSavedMatches } from '../../../hooks/useSavedMatches'
import { openExampleMatch } from '../../../hooks/useScoreMatch'
import { shared, theme } from '../../../constants'
import { routes } from '../../../utils/routes'

/** Scorekeeper home: matches saved on this device (in progress first) and "New match". */
export default function ScorekeeperScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { matches } = useSavedMatches()
  const live = (matches ?? []).filter(m => m.status === 'live')
  const done = (matches ?? []).filter(m => m.status === 'final')

  return (
    <View style={shared.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.xxl }}>
        <ScreenContainer>
          <ScreenHeader safeTop kicker="Experimental" title="Scorekeeper" onBack={() => router.back()} />
          <Text style={[shared.body, { color: theme.colors.subtextStrong }]}>
            Tap to score, and the app tracks rotations, subs and time-outs and fills in the official scoresheet. Every tap is saved on this device, so you can close the app and pick up where you left off.
          </Text>
          <Button label="New match" icon="add" onPress={() => router.push(routes.scorekeeperNew())} style={{ marginTop: theme.spacing.lg }} testID="new-match" />
          <View style={[shared.card, { marginTop: theme.spacing.md, gap: theme.spacing.xs }]} testID="example-card">
            <Text style={shared.subheading}>See what you get</Text>
            <Text style={[shared.body, { color: theme.colors.subtextStrong }]}>
              Open a finished example match: the scoresheet, the official USA Volleyball form filled in, and Copy to paper.
            </Text>
            <Button
              label="Open the example"
              icon="document-text-outline"
              variant="secondary"
              onPress={() => void openExampleMatch().then(id => router.push(routes.scorekeeperSheet(id)))}
              style={{ marginTop: theme.spacing.xs }}
              testID="open-example"
            />
          </View>

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
