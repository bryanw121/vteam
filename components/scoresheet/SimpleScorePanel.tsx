import { useState, type ReactNode } from 'react'
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../ui/Text'
import { BottomSheet, Chip, ConfirmDialog, ScreenContainer, Spinner } from '../ui'
import { SheetBody } from './SheetParts'
import { Button } from '../Button'
import { TEAM_COLORS } from './teamColors'
import { SimpleScoreboard } from './SimpleScoreboard'
import { useSimpleScore } from '../../hooks/useSimpleScore'
import { SIMPLE_FORMATS, setsToWin } from '../../lib/simpleScore'
import { shared, theme } from '../../constants'
import type { SimpleFormat, TeamSide } from '../../types'

const sameFormat = (a: SimpleFormat, b: SimpleFormat) => a.sets === b.sets && a.target === b.target && a.cap === b.cap

/** Shorter than this and wider than tall: a phone turned sideways, so the scoreboard opens by itself. */
const PHONE_LANDSCAPE_MAX_HEIGHT = 500

/**
 * Simple score: a plain point counter for a game that doesn't need the official scoresheet.
 * Two big buttons, sets and serve tracked, undo. Saved on the device after every tap.
 * The Scorekeeper home's Simple tab; `top` is the home's header and Simple | Official switch.
 */
export function SimpleScorePanel({ top }: { top: ReactNode }) {
  const insets = useSafeAreaInsets()
  const s = useSimpleScore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  // The sideways view (full scoring, big enough to show people): opened with "Sideways view", or by turning a phone to landscape.
  const [showBoard, setShowBoard] = useState(false)
  const [boardDismissed, setBoardDismissed] = useState(false)
  // After a set ends, the board keeps its final score until "Start set N" (rally count when tapped),
  // so a wrong last point can still be taken back with −1.
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const { width, height } = useWindowDimensions()
  const phoneLandscape = width > height && height < PHONE_LANDSCAPE_MAX_HEIGHT

  if (!s.loaded || !s.match) {
    return (
      <View style={shared.screen}>
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md }}>
          <ScreenContainer>
            {top}
            <View style={{ paddingVertical: theme.spacing.xl, alignItems: 'center' }}><Spinner color={theme.colors.primaryText} /></View>
          </ScreenContainer>
        </ScrollView>
      </View>
    )
  }

  // ── Scoring ────────────────────────────────────────────────────────────────
  const { match, state } = s
  if (!match || !state) return null
  const formatLabel = SIMPLE_FORMATS.find(f => sameFormat(f.format, match.format))?.label ?? `Best of ${match.format.sets}`
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
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.xl }}>
        <ScreenContainer>
          {top}
          <Text style={[shared.subheading, { marginTop: theme.spacing.md }]} accessibilityRole="header" testID="simple-set-title">
            {state.over ? 'Match over' : betweenSets ? `Set ${state.current} over` : `Set ${state.current + 1}${match.format.sets > 1 ? ` of up to ${match.format.sets}` : ''}`}
          </Text>

          <Pressable
            onPress={() => setSettingsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Game settings: ${formatLabel}, ${name(match.firstServe)} serves first. Change`}
            style={shared.simpleSettingsRow}
            testID="simple-settings"
          >
            <Ionicons name="options-outline" size={18} color={theme.colors.subtextStrong} />
            <Text style={[shared.body, { flex: 1, color: theme.colors.subtextStrong }]} numberOfLines={2}>
              {formatLabel} · {name(match.firstServe)} serves first
            </Text>
            <Text style={[shared.body, { color: theme.colors.primaryText, fontFamily: theme.fonts.bodySemiBold }]}>Change</Text>
          </Pressable>

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
            <Button label="Sideways view" icon="phone-landscape-outline" variant="secondary" size="touch" fullWidth={false} onPress={() => { setBoardDismissed(false); setShowBoard(true) }} testID="simple-show-board" />
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
            Saved on this device after every tap. For lineups, subs and the official scoresheet, switch to Official.
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
          locked={locked}
          notice={!locked || !lastDone?.winner ? null : state.over
            ? `${name(state.winner!)} wins ${state.setsWon[state.winner!]}–${state.setsWon[state.winner === 'A' ? 'B' : 'A']}. Wrong point? Tap −1.`
            : `Set to ${name(lastDone.winner)}, ${Math.max(lastDone.A, lastDone.B)}–${Math.min(lastDone.A, lastDone.B)}. Wrong point? Tap −1.`}
          nextSetLabel={betweenSets ? `Start set ${state.current + 1} · ${name(state.serving)} serves` : null}
          onPoint={side => s.point(side)}
          onMinus={side => s.minus(side)}
          onNextSet={() => setStartedAt(match.rallies.length)}
          onSwitchSides={() => setFlipped(f => !f)}
          onClose={() => { setShowBoard(false); setBoardDismissed(true) }}
        />
      )}

      <BottomSheet visible={settingsOpen} onDismiss={() => setSettingsOpen(false)} title="Game settings">
        <SheetBody>
          <Text style={[shared.label, { marginBottom: 0 }]}>Format</Text>
          <View role="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {SIMPLE_FORMATS.map(f => (
              <Chip key={f.key} label={f.label} role="radio" active={sameFormat(f.format, match.format)} onPress={() => s.update({ format: f.format })} testID={`simple-format-${f.key}`} />
            ))}
          </View>
          <Text style={shared.caption}>Win by 2. Best-of matches play the deciding set to 15. Changing it keeps the points scored so far.</Text>
          <Text style={[shared.label, { marginBottom: 0 }]}>Serves first</Text>
          <View role="radiogroup" style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {(['A', 'B'] as const).map(side => (
              <Chip key={side} label={name(side)} role="radio" variant="tint" active={match.firstServe === side} onPress={() => s.update({ firstServe: side })} testID={`simple-serve-${side}`} />
            ))}
          </View>
          <Button label="Done" onPress={() => setSettingsOpen(false)} testID="simple-settings-done" />
        </SheetBody>
      </BottomSheet>

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
