import { useState } from 'react'
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../../../components/ui/Text'
import { Chip, ConfirmDialog, ScreenContainer, ScreenHeader, Spinner } from '../../../components/ui'
import { Button } from '../../../components/Button'
import { Input } from '../../../components/Input'
import { TEAM_COLORS } from '../../../components/scoresheet/teamColors'
import { SimpleScoreboard } from '../../../components/scoresheet/SimpleScoreboard'
import { useSimpleScore } from '../../../hooks/useSimpleScore'
import { SIMPLE_FORMATS, setsToWin } from '../../../lib/simpleScore'
import { shared, theme } from '../../../constants'
import { routes } from '../../../utils/routes'
import type { TeamSide } from '../../../types'

/** Shorter than this and wider than tall: a phone turned sideways, so the scoreboard opens by itself. */
const PHONE_LANDSCAPE_MAX_HEIGHT = 500

/**
 * Simple score: a plain point counter for a game that doesn't need the official scoresheet.
 * Two big buttons, sets and serve tracked, undo. Saved on the device after every tap.
 */
export default function SimpleScoreScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const s = useSimpleScore()
  const [names, setNames] = useState<Record<TeamSide, string>>({ A: '', B: '' })
  const [formatKey, setFormatKey] = useState(SIMPLE_FORMATS[1].key)
  const [firstServe, setFirstServe] = useState<TeamSide>('A')
  const [flipped, setFlipped] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  // The sideways scoreboard: opened with "Show the score", or by turning a phone to landscape.
  const [showBoard, setShowBoard] = useState(false)
  const [boardDismissed, setBoardDismissed] = useState(false)
  // After a set ends, the board keeps its final score until "Start set N" (rally count when tapped),
  // so a wrong last point can still be taken back with −1.
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const { width, height } = useWindowDimensions()
  const phoneLandscape = width > height && height < PHONE_LANDSCAPE_MAX_HEIGHT

  const back = () => (router.canGoBack() ? router.back() : router.replace(routes.scorekeeper()))
  const format = SIMPLE_FORMATS.find(f => f.key === formatKey)!.format

  if (!s.loaded) {
    return (
      <View style={[shared.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Spinner color={theme.colors.primary} />
      </View>
    )
  }

  // ── Setup ──────────────────────────────────────────────────────────────────
  if (!s.match || !s.state) {
    return (
      <View style={shared.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.xxl }} keyboardShouldPersistTaps="handled">
          <ScreenContainer>
            <ScreenHeader safeTop kicker="Scorekeeper" title="Simple score" onBack={back} />
            <Text style={[shared.body, { color: theme.colors.subtextStrong, marginBottom: theme.spacing.md }]}>
              Just the score: tap the team that won the rally. Sets and serve are tracked for you. No lineups and no scoresheet.
            </Text>
            <View style={[shared.card, { marginHorizontal: 0, gap: theme.spacing.md }]}>
              {(['A', 'B'] as const).map(side => (
                <View key={side} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm }}>
                  <View style={[shared.simpleTeamSwatch, { backgroundColor: TEAM_COLORS[side].fill }]} />
                  <View style={{ flex: 1 }}>
                    <Input label={`Team ${side}`} value={names[side]} onChangeText={v => setNames(n => ({ ...n, [side]: v }))} placeholder={`Team ${side}`} maxLength={40} autoCapitalize="words" testID={`simple-name-${side}`} />
                  </View>
                </View>
              ))}
              <View style={{ gap: theme.spacing.xs }}>
                <Text style={shared.label}>Format</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {SIMPLE_FORMATS.map(f => <Chip key={f.key} label={f.label} role="radio" active={formatKey === f.key} onPress={() => setFormatKey(f.key)} testID={`simple-format-${f.key}`} />)}
                </View>
                <Text style={shared.caption}>Win by 2. Best-of matches play the deciding set to 15.</Text>
              </View>
              <View style={{ gap: theme.spacing.xs }}>
                <Text style={shared.label}>Serves first</Text>
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  {(['A', 'B'] as const).map(side => (
                    <Chip key={side} label={names[side].trim() || `Team ${side}`} role="radio" variant="tint" active={firstServe === side} onPress={() => setFirstServe(side)} testID={`simple-serve-${side}`} />
                  ))}
                </View>
              </View>
              <Button label="Start" icon="play" onPress={() => s.start({ names, format, firstServe })} testID="simple-start" />
            </View>
          </ScreenContainer>
        </ScrollView>
      </View>
    )
  }

  // ── Scoring ────────────────────────────────────────────────────────────────
  const { match, state } = s
  const order: TeamSide[] = flipped ? ['B', 'A'] : ['A', 'B']
  const lastDone = state.setJustEnded ? state.sets[state.over ? state.current : state.current - 1] : null
  // Between sets: the set that just ended stays on the board until Start set N.
  const betweenSets = state.setJustEnded && !state.over && startedAt !== match.rallies.length
  const set = betweenSets ? state.sets[state.current - 1] : state.sets[state.current]
  const locked = state.over || betweenSets
  const name = (side: TeamSide) => match.names[side]
  const finished = state.sets.filter(x => x.winner)

  return (
    <View style={shared.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.xl }}>
        <ScreenContainer>
          <ScreenHeader safeTop kicker="Simple score" title={state.over ? 'Match over' : betweenSets ? `Set ${state.current} over` : `Set ${state.current + 1}${match.format.sets > 1 ? ` of up to ${match.format.sets}` : ''}`} onBack={back} />

          {lastDone?.winner && locked && (
            <View style={[shared.card, shared.simpleBanner]} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="simple-set-result">
              <Ionicons name={state.over ? 'trophy' : 'flag'} size={18} color={theme.colors.medalGold} />
              <Text style={[shared.body, { flex: 1 }]}>
                {state.over
                  ? `${name(state.winner!)} wins ${state.setsWon[state.winner!]}–${state.setsWon[state.winner === 'A' ? 'B' : 'A']}`
                  : `Set to ${name(lastDone.winner)}, ${Math.max(lastDone.A, lastDone.B)}–${Math.min(lastDone.A, lastDone.B)}.`}
                {' '}Wrong point? Tap −1 to take it back.
              </Text>
            </View>
          )}
          {betweenSets && (
            <Button
              label={`Start set ${state.current + 1} · ${name(state.serving)} serves`}
              icon="play"
              onPress={() => setStartedAt(match.rallies.length)}
              testID="simple-next-set"
            />
          )}

          <View style={shared.simpleBoard}>
            {order.map(side => {
              const color = TEAM_COLORS[side]
              const serving = !locked && state.serving === side
              return (
                <View key={side} style={{ flex: 1, gap: theme.spacing.sm }}>
                <Pressable
                  onPress={() => s.point(side)}
                  disabled={locked}
                  accessibilityRole="button"
                  accessibilityLabel={`Point ${name(side)}. ${name(side)} has ${set[side]}${serving ? ', serving' : ''}`}
                  testID={`simple-point-${side}`}
                  style={({ pressed }) => [shared.simpleSide, { backgroundColor: color.fill, opacity: locked ? 0.6 : pressed ? 0.85 : 1 }]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                    {serving && <Ionicons name="tennisball" size={16} color={color.ink} accessibilityLabel="Serving" />}
                    <Text style={[shared.simpleTeam, { color: color.ink }]} numberOfLines={1}>{name(side)}</Text>
                  </View>
                  <Text style={[shared.simpleScore, { color: color.ink }]} maxFontSizeMultiplier={1.3}>{set[side]}</Text>
                  <Text style={[shared.simpleSets, { color: color.ink }]}>Sets {state.setsWon[side]}{match.format.sets > 1 ? ` / ${setsToWin(match.format)}` : ''}</Text>
                </Pressable>
                <Button
                  label={`−1 ${name(side)}`}
                  variant="secondary"
                  size="touch"
                  onPress={() => s.minus(side)}
                  disabled={set[side] === 0}
                  accessibilityLabel={`Take a point away from ${name(side)}`}
                  testID={`simple-minus-${side}`}
                />
                </View>
              )
            })}
          </View>

          <View style={shared.simpleActions}>
            <Button label="Show the score" icon="phone-landscape-outline" variant="secondary" size="touch" fullWidth={false} onPress={() => { setBoardDismissed(false); setShowBoard(true) }} testID="simple-show-board" />
            <Button label="Switch sides" icon="swap-horizontal" variant="secondary" size="touch" fullWidth={false} onPress={() => setFlipped(f => !f)} testID="simple-flip" />
            <Button label="New match" icon="refresh" variant={state.over ? 'primary' : 'ghost'} size="touch" fullWidth={false} onPress={() => (state.over ? s.reset() : setConfirmNew(true))} testID="simple-new" />
          </View>

          {finished.length > 0 && (
            <View style={[shared.card, { marginHorizontal: 0, gap: theme.spacing.xs }]} testID="simple-sets">
              <Text style={shared.label}>Sets</Text>
              {finished.map((x, i) => (
                <Text key={i} style={shared.body}>Set {i + 1}: {name('A')} {x.A} – {x.B} {name('B')}</Text>
              ))}
            </View>
          )}
          <Text style={[shared.caption, { marginTop: theme.spacing.md }]}>
            Saved on this device after every tap. For lineups, subs and the official scoresheet, use the full Scorekeeper.
          </Text>
        </ScreenContainer>
      </ScrollView>

      {(showBoard || (phoneLandscape && !boardDismissed)) && (
        <SimpleScoreboard
          names={match.names}
          scores={{ A: set.A, B: set.B }}
          setsWon={state.setsWon}
          serving={locked ? null : state.serving}
          order={order}
          setLabel={state.over ? 'Final' : betweenSets ? `Set ${state.current} over` : `Set ${state.current + 1}${match.format.sets > 1 ? ` of up to ${match.format.sets}` : ''}`}
          onClose={() => { setShowBoard(false); setBoardDismissed(true) }}
        />
      )}

      <ConfirmDialog
        visible={confirmNew}
        title="Start a new match?"
        body="This one's score will be cleared."
        confirmLabel="New match"
        destructive
        onConfirm={() => { setConfirmNew(false); s.reset() }}
        onCancel={() => setConfirmNew(false)}
        testIDPrefix="simple-new-dialog"
      />
    </View>
  )
}
