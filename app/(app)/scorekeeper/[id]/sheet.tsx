import { useMemo } from 'react'
import { ScrollView, Share, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../../../../components/ui/Text'
import { ScreenContainer, ScreenHeader, ScreenState } from '../../../../components/ui'
import { Button } from '../../../../components/Button'
import { MatchDetailsCard } from '../../../../components/scoresheet/MatchDetailsCard'
import { OfficialSheetButton } from '../../../../components/scoresheet/OfficialSheetButton'
import { ScoresheetPreview } from '../../../../components/scoresheet/ScoresheetPreview'
import { useScoreMatch } from '../../../../hooks/useScoreMatch'
import { scoresheetHtml } from '../../../../lib/scoresheet/sheetHtml'
import { matchTitle, shareText, teamName } from '../../../../lib/scoresheet/summary'
import { rememberInfo } from '../../../../lib/scoresheet/teamStore'
import { shared, theme } from '../../../../constants'
import { routes } from '../../../../utils/routes'

/** The completed scoresheet: printable / PDF, plus a plain-text result to share. */
export default function ScoresheetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { doc, state, loading, updateInfo } = useScoreMatch(id)
  const html = useMemo(() => (doc && state ? scoresheetHtml(doc, state) : ''), [doc, state])

  return (
    <View style={shared.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenState loading={loading} error={!loading && !doc ? "This match isn't saved on this device." : null} ready={!!doc && !!state}>
        {doc && state && (
          <ScrollView contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.xl }}>
            <ScreenContainer>
              <ScreenHeader
                safeTop
                kicker={doc.example ? 'Example' : state.over ? 'Final' : 'In progress'}
                title="Scoresheet"
                onBack={() => (router.canGoBack() ? router.back() : router.replace(routes.scorekeeperMatch(doc.id)))}
              />
              <Text style={[shared.body, { color: theme.colors.subtextStrong, marginBottom: theme.spacing.md }]}>{matchTitle(doc)}</Text>
              {doc.example && (
                <View style={[shared.card, { gap: theme.spacing.xs, marginBottom: theme.spacing.md, borderColor: theme.colors.primary }]} testID="example-note">
                  <Text style={shared.subheading}>This is an example</Text>
                  <Text style={[shared.body, { color: theme.colors.subtextStrong }]}>
                    A made-up match, scored in the app, so you can see what you get: try Copy to paper, or download the official USA Volleyball form.
                  </Text>
                  <Button label="Start your own match" icon="add" variant="secondary" onPress={() => router.replace(routes.scorekeeperNew())} style={{ marginTop: theme.spacing.xs }} />
                </View>
              )}
              <Button
                label={doc.copied?.length ? 'Copy to paper (continue)' : 'Copy to paper (guided)'}
                icon="create-outline"
                onPress={() => router.push(routes.scorekeeperCopy(doc.id))}
                style={{ marginBottom: theme.spacing.xs }}
                testID="sheet-copy"
              />
              <Text style={[shared.caption, { marginBottom: theme.spacing.md }]}>
                Walks you through the paper form box by box, in its own order. Tick parts off as you go.
              </Text>
              <MatchDetailsCard
                info={doc.setup.info}
                onChange={patch => {
                  updateInfo(patch)
                  // The example's made-up details shouldn't fill in someone's next real match.
                  if (!doc.example) void rememberInfo({ ...doc.setup.info, ...patch })
                }}
              />
              <Button
                label="Share result"
                icon="share-outline"
                variant="secondary"
                onPress={() => void Share.share({ message: shareText(doc, state) }).catch(() => {})}
                style={{ marginBottom: theme.spacing.sm }}
              />
              <OfficialSheetButton doc={doc} state={state} />
              <ScoresheetPreview html={html} title={`${matchTitle(doc)} scoresheet`}>
                <View style={[shared.card, { gap: theme.spacing.sm }]}>
                  {state.sets.map(s => (
                    <View key={s.index} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={shared.body}>Set {s.index + 1}</Text>
                      <Text style={[shared.body, { fontFamily: theme.fonts.bodySemiBold }]}>{teamName(doc, 'A')} {s.teams.A.score} – {s.teams.B.score} {teamName(doc, 'B')}</Text>
                    </View>
                  ))}
                  {state.remarks.length > 0 && (
                    <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.sm }}>
                      <Text style={shared.label}>Remarks</Text>
                      {state.remarks.map((r, i) => <Text key={i} style={shared.caption}>{i + 1}. {r}</Text>)}
                    </View>
                  )}
                </View>
              </ScoresheetPreview>
            </ScreenContainer>
          </ScrollView>
        )}
      </ScreenState>
    </View>
  )
}
