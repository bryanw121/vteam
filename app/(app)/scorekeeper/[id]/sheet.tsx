import { useMemo } from 'react'
import { ScrollView, Share, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../../../../components/ui/Text'
import { ScreenContainer, ScreenHeader, ScreenState } from '../../../../components/ui'
import { Button } from '../../../../components/Button'
import { ScoresheetPreview } from '../../../../components/scoresheet/ScoresheetPreview'
import { useScoreMatch } from '../../../../hooks/useScoreMatch'
import { scoresheetHtml } from '../../../../lib/scoresheet/sheetHtml'
import { matchTitle, shareText, teamName } from '../../../../lib/scoresheet/summary'
import { shared, theme } from '../../../../constants'
import { routes } from '../../../../utils/routes'

/** The completed scoresheet: printable / PDF, plus a plain-text result to share. */
export default function ScoresheetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { doc, state, loading } = useScoreMatch(id)
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
                kicker={state.over ? 'Final' : 'In progress'}
                title="Scoresheet"
                onBack={() => (router.canGoBack() ? router.back() : router.replace(routes.scorekeeperMatch(doc.id)))}
              />
              <Text style={[shared.body, { color: theme.colors.subtextStrong, marginBottom: theme.spacing.md }]}>{matchTitle(doc)}</Text>
              <Button
                label="Share result"
                icon="share-outline"
                variant="secondary"
                onPress={() => void Share.share({ message: shareText(doc, state) }).catch(() => {})}
                style={{ marginBottom: theme.spacing.sm }}
              />
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
