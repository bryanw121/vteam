import { useEffect, useState } from 'react'
import { ScrollView, Share, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../../../../components/ui/Text'
import { Chip, IconButton, ScreenContainer, ScreenHeader, ScreenState } from '../../../../components/ui'
import { Button } from '../../../../components/Button'
import { MatchDetailsCard } from '../../../../components/scoresheet/MatchDetailsCard'
import { OfficialSheetButton } from '../../../../components/scoresheet/OfficialSheetButton'
import { OfficialSheetView } from '../../../../components/scoresheet/OfficialSheetView'
import { TourTarget } from '../../../../components/tour/TourTarget'
import { useScoreMatch } from '../../../../hooks/useScoreMatch'
import { useOfficialLayout } from '../../../../hooks/useOfficialLayout'
import { useTour } from '../../../../contexts/tour'
import { matchTitle, scoreLine, shareText } from '../../../../lib/scoresheet/summary'
import { rememberInfo } from '../../../../lib/scoresheet/teamStore'
import { TOUR_TARGETS } from '../../../../constants/tours'
import { shared, theme } from '../../../../constants'
import { routes } from '../../../../utils/routes'

/** How much bigger "Enlarge" draws the form (scroll sideways to read it). */
const ENLARGED = 2.4

/**
 * The finished scoresheet: the official USA Volleyball form as it will print, then what
 * to do with it (Copy to paper, the PDF, share the result) and the header details.
 */
export default function ScoresheetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const tour = useTour()
  const { doc, state, loading, updateInfo } = useScoreMatch(id)
  const layout = useOfficialLayout(doc, state)
  const [page, setPage] = useState(0)
  const [enlarged, setEnlarged] = useState(false)
  const [formWidth, setFormWidth] = useState(0)

  // The example explains itself: walk through it every time it's opened.
  const isExample = !!doc?.example
  useEffect(() => {
    if (!isExample) return
    const timer = setTimeout(() => tour.start('scorekeeperExample', 'first_use'), 600)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the example has loaded
  }, [isExample])

  return (
    <View style={shared.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenState loading={loading} error={!loading && !doc ? "This match isn't saved on this device." : null} ready={!!doc && !!state && !!layout}>
        {doc && state && layout && (
          <ScrollView contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.xl }}>
            <ScreenContainer>
              <ScreenHeader
                safeTop
                kicker={doc.example ? 'Example' : state.over ? 'Final' : 'In progress'}
                title="Scoresheet"
                onBack={() => (router.canGoBack() ? router.back() : router.replace(routes.scorekeeperMatch(doc.id)))}
              />
              <Text style={[shared.body, { color: theme.colors.subtextStrong }]}>{matchTitle(doc)} · {scoreLine(state)}</Text>
              {doc.example && (
                <Text style={[shared.caption, { marginTop: theme.spacing.xs }]} testID="example-note">
                  A made-up match, scored in the app, to show what you get.
                </Text>
              )}

              {layout.pages.length > 1 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md }} role="radiogroup">
                  {layout.pages.map((kind, i) => (
                    <Chip key={i} label={kind === 'plain' ? 'Remarks' : `Sheet ${i + 1}`} variant="tint" active={page === i} onPress={() => setPage(i)} role="radio" />
                  ))}
                </View>
              )}

              <View style={{ marginTop: theme.spacing.md }} onLayout={e => setFormWidth(e.nativeEvent.layout.width)}>
                <TourTarget id={TOUR_TARGETS.sheetForm}>
                  <ScrollView horizontal scrollEnabled={enlarged} showsHorizontalScrollIndicator={enlarged}>
                    <View style={{ width: formWidth ? formWidth * (enlarged ? ENLARGED : 1) : '100%' }}>
                      <OfficialSheetView layout={layout} page={page} accessibilityLabel={`Official USA Volleyball scoresheet, ${layout.pages[page] === 'plain' ? 'remarks page' : `sheet ${page + 1}`}`} testID="sheet-form" />
                    </View>
                  </ScrollView>
                </TourTarget>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing.xs }}>
                  <Text style={[shared.caption, { flex: 1 }]}>{enlarged ? 'Scroll sideways to read across.' : 'The form as it will print.'}</Text>
                  <IconButton icon={enlarged ? 'contract-outline' : 'expand-outline'} size={44} label={enlarged ? 'Fit the form to the screen' : 'Enlarge the form'} onPress={() => setEnlarged(v => !v)} testID="sheet-enlarge" />
                </View>
              </View>

              <TourTarget id={TOUR_TARGETS.sheetCopy} style={{ marginTop: theme.spacing.md }}>
                <Button
                  label={doc.copied?.length ? 'Copy to paper (continue)' : 'Copy to paper'}
                  icon="create-outline"
                  onPress={() => router.push(routes.scorekeeperCopy(doc.id))}
                  testID="sheet-copy"
                />
              </TourTarget>
              <Text style={[shared.caption, { marginTop: theme.spacing.xs, marginBottom: theme.spacing.md }]}>
                One part of the form at a time, with what to write in it.
              </Text>

              <TourTarget id={TOUR_TARGETS.sheetPdf}>
                <OfficialSheetButton doc={doc} state={state} />
              </TourTarget>

              {doc.example ? (
                <TourTarget id={TOUR_TARGETS.sheetStart} style={{ marginTop: theme.spacing.sm }}>
                  <Button label="Start your own match" icon="add" variant="secondary" onPress={() => router.replace(routes.scorekeeperNew())} testID="sheet-start" />
                </TourTarget>
              ) : (
                <>
                  <Button
                    label="Share result"
                    icon="share-outline"
                    variant="secondary"
                    onPress={() => void Share.share({ message: shareText(doc, state) }).catch(() => {})}
                    style={{ marginBottom: theme.spacing.md }}
                  />
                  <MatchDetailsCard
                    info={doc.setup.info}
                    onChange={patch => {
                      updateInfo(patch)
                      void rememberInfo({ ...doc.setup.info, ...patch })
                    }}
                  />
                </>
              )}
            </ScreenContainer>
          </ScrollView>
        )}
      </ScreenState>
    </View>
  )
}
