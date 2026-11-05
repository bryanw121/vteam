import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../../../../components/ui/Text'
import { IconButton, ScreenContainer, ScreenHeader, ScreenState } from '../../../../components/ui'
import { Button } from '../../../../components/Button'
import { SheetMap } from '../../../../components/scoresheet/SheetMap'
import { useScoreMatch } from '../../../../hooks/useScoreMatch'
import { copySteps, resumeIndex } from '../../../../lib/scoresheet/copySteps'
import { COMPACT_TEXT_SCALE, shared, theme } from '../../../../constants'
import { routes } from '../../../../utils/routes'
import type { CopySectionProps } from '../../../../types'

/**
 * Copy to paper: walks through the paper scoresheet in its own order, one part at a time, with
 * a map of where that part is, big numbers and plain instructions. Ticks are saved with the
 * match, so the scorer can stop and come back. Works offline (everything is on the device).
 */
export default function CopyToPaperScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { doc, state, loading, setCopied } = useScoreMatch(id)
  const steps = useMemo(() => (doc && state ? copySteps(doc, state) : []), [doc, state])
  const copied = doc?.copied ?? []
  const [index, setIndex] = useState<number | null>(null)
  const [list, setList] = useState(false)

  // Open where the scorer left off.
  useEffect(() => {
    if (index == null && steps.length) setIndex(resumeIndex(steps, doc?.copied))
  }, [steps, index, doc?.copied])

  const step = index != null ? steps[index] : null
  // "Set 1 · Starting lineup": the set goes in the kicker so the title fits on a phone.
  const [group, short] = step?.title.includes(' · ') ? step.title.split(' · ') : ['', step?.title ?? '']
  const doneCount = steps.filter(s => copied.includes(s.id)).length
  const allDone = steps.length > 0 && doneCount === steps.length
  const back = () => (router.canGoBack() ? router.back() : router.replace(routes.scorekeeperSheet(id ?? '')))

  const next = () => {
    if (!step || index == null) return
    setCopied(step.id, true)
    if (index < steps.length - 1) setIndex(index + 1)
    else setList(true)
  }

  return (
    <View style={shared.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenState loading={loading} error={!loading && !doc ? "This match isn't saved on this device." : null} ready={!!step}>
        {step && index != null && (
          <ScrollView contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.xl }}>
            <ScreenContainer>
              <ScreenHeader
                safeTop
                kicker={list ? 'Copy to paper' : `Copy to paper · ${group ? `${group} · ` : ''}${index + 1} of ${steps.length}`}
                title={list ? 'Checklist' : short}
                onBack={back}
                right={<IconButton icon={list ? 'reader-outline' : 'list-outline'} label={list ? 'Back to the current step' : 'Show the checklist'} size={44} onPress={() => setList(v => !v)} testID="copy-toggle-list" />}
              />
              <View style={{ height: 6, borderRadius: theme.radius.full, backgroundColor: theme.colors.border, marginBottom: theme.spacing.md }} accessibilityLabel={`${doneCount} of ${steps.length} parts copied`}>
                <View style={{ width: `${(doneCount / steps.length) * 100}%`, height: 6, borderRadius: theme.radius.full, backgroundColor: theme.colors.primary }} />
              </View>

              {list ? (
                <View style={{ gap: theme.spacing.sm }}>
                  {allDone && (
                    <View style={[shared.card, { gap: theme.spacing.xs }]} testID="copy-all-done">
                      <Text style={shared.subheading}>All copied</Text>
                      <Text style={shared.body}>Sign as scorer and hand the sheet to the 1st referee to sign.</Text>
                    </View>
                  )}
                  <View style={shared.card}>
                    {steps.map((s, i) => {
                      const done = copied.includes(s.id)
                      return (
                        <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: i < steps.length - 1 ? 1 : 0, borderBottomColor: theme.colors.border }}>
                          <Pressable onPress={() => { setIndex(i); setList(false) }} style={{ flex: 1, minHeight: 48, justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={`Go to ${s.title}`}>
                            <Text style={[shared.body, done && { color: theme.colors.subtextStrong }]}>{s.title}</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setCopied(s.id, !done)}
                            role="checkbox"
                            aria-checked={done}
                            accessibilityLabel={`${s.title} copied`}
                            hitSlop={8}
                            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                            testID={`copy-tick-${s.id}`}
                          >
                            <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={done ? theme.colors.success : theme.colors.subtext} />
                          </Pressable>
                        </View>
                      )
                    })}
                  </View>
                  <Button
                    label={allDone ? 'Back to the scoresheet' : 'Continue where I left off'}
                    onPress={() => (allDone ? back() : (setIndex(resumeIndex(steps, copied)), setList(false)))}
                    testID="copy-continue"
                  />
                </View>
              ) : (
                <View style={{ gap: theme.spacing.md }}>
                  <SheetMap regions={step.regions} sheet={step.sheet} />
                  <Text style={[shared.body, { color: theme.colors.subtextStrong }]}>{step.where}</Text>
                  {step.sections.map((section, i) => <Section key={`${step.id}-${i}`} section={section} />)}
                  <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                    <Button label="Back" variant="secondary" onPress={() => setIndex(Math.max(0, index - 1))} disabled={index === 0} style={{ flex: 1 }} testID="copy-prev" />
                    <Button
                      label={index < steps.length - 1 ? `Done · Next` : 'Done · Finish'}
                      icon="checkmark"
                      onPress={next}
                      style={{ flex: 2 }}
                      testID="copy-next"
                    />
                  </View>
                  {index < steps.length - 1 && <Text style={[shared.caption, { textAlign: 'center' }]}>Next: {steps[index + 1].title}</Text>}
                </View>
              )}
            </ScreenContainer>
          </ScrollView>
        )}
      </ScreenState>
    </View>
  )
}

/** Several service-round scores in one box get a smaller size than a single number. */
const LONG_CELL = 4
const cellSize = (value: string) => (value.length > LONG_CELL ? theme.font.size.md : theme.font.heading.md)

function Section({ section }: CopySectionProps) {
  if (section.kind === 'grid') {
    return (
      <View style={[shared.card, { gap: theme.spacing.sm }]}>
        <Text style={shared.label}>{section.title}</Text>
        <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
          {section.cells.map(cell => (
            <View key={cell.label} style={{ flex: 1, alignItems: 'center', paddingVertical: theme.spacing.sm, borderRadius: theme.radius.sm, backgroundColor: theme.colors.background }}>
              <Text style={shared.caption}>{cell.label}</Text>
              <Text
                style={{ fontFamily: theme.fonts.display, fontSize: cellSize(cell.value), color: theme.colors.text, textAlign: 'center' }}
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
              >
                {cell.value.replace(/ · /g, '\n')}
              </Text>
            </View>
          ))}
        </View>
      </View>
    )
  }
  if (section.kind === 'big') {
    return (
      <View style={[shared.card, { gap: theme.spacing.xs }]}>
        <Text style={shared.label}>{section.title}</Text>
        <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.heading.hero, color: theme.colors.text }}>{section.value}</Text>
        <Text style={shared.body}>{section.detail}</Text>
      </View>
    )
  }
  return (
    <View style={[shared.card, { gap: theme.spacing.xs }]}>
      {!!section.title && <Text style={shared.label}>{section.title}</Text>}
      {section.rows.length === 0 && <Text style={[shared.body, { color: theme.colors.subtextStrong }]}>{section.empty ?? 'Nothing to write'}</Text>}
      {section.rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: theme.spacing.md, paddingVertical: theme.spacing.xs }}>
          <Text style={[shared.body, { color: theme.colors.subtextStrong, flexShrink: 1 }]}>{row.label}</Text>
          <Text style={[shared.body, { fontFamily: theme.fonts.bodySemiBold, color: theme.colors.text, flexShrink: 1, textAlign: 'right' }]}>{row.value}</Text>
        </View>
      ))}
    </View>
  )
}
