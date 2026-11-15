import { Platform, Pressable, View, useWindowDimensions, type ViewStyle } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../ui/Text'
import { Button } from '../Button'
import { TEAM_COLORS } from './teamColors'
import { shared, theme } from '../../constants'
import type { SimpleScoreboardProps, TeamSide } from '../../types'

/** On web the board covers the whole window, sidebar included (a phone held sideways is wide enough for the desktop layout). */
const COVER_WINDOW = Platform.OS === 'web' ? ({ position: 'fixed' } as unknown as ViewStyle) : null

/** Share of the board's height the score numbers take. */
const SCORE_HEIGHT_SHARE = 0.42

/**
 * Simple score sideways: the whole scorer, as big as it gets, so it can be shown to people around
 * the court. Tap a side for its point, −1 under it to take one back, Start set N between sets.
 * Always landscape: when the screen is already landscape it fills it as is; when it's portrait
 * (the native app is locked to portrait, or rotation lock is on) it's turned a quarter, so
 * tilting the phone reads it.
 */
export function SimpleScoreboard(p: SimpleScoreboardProps) {
  const { names, scores, setsWon, serving, order, setLabel, locked, notice, nextSetLabel } = p
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const rotate = height > width
  // The board's own size, in landscape terms.
  const boardW = rotate ? height : width
  const boardH = rotate ? width : height
  const scoreSize = Math.round(boardH * SCORE_HEIGHT_SHARE)
  const pad = Math.max(insets.left, insets.right, insets.top, insets.bottom, theme.spacing.sm)

  return (
    <View style={[shared.scoreboardRoot, COVER_WINDOW]} accessibilityViewIsModal testID="simple-scoreboard">
      <View
        style={[
          { width: boardW, height: boardH, padding: pad, paddingTop: pad + 44, gap: theme.spacing.sm, flexDirection: 'row' },
          rotate && { position: 'absolute', left: (width - boardW) / 2, top: (height - boardH) / 2, transform: [{ rotate: '90deg' }] },
        ]}
      >
        {order.map((side: TeamSide) => {
          const color = TEAM_COLORS[side]
          return (
            <View key={side} style={{ flex: 1, gap: theme.spacing.xs }}>
            <Pressable
              onPress={() => p.onPoint(side)}
              disabled={locked}
              accessibilityRole="button"
              accessibilityLabel={`Point ${names[side]}. ${names[side]} has ${scores[side]}${serving === side ? ', serving' : ''}, sets ${setsWon[side]}`}
              testID={`board-point-${side}`}
              style={({ pressed }) => [shared.scoreboardHalf, { backgroundColor: color.fill, opacity: locked ? 0.6 : pressed ? 0.85 : 1 }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                {serving === side && <Ionicons name="tennisball" size={20} color={color.ink} accessibilityLabel="Serving" />}
                <Text style={[shared.scoreboardTeam, { color: color.ink }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{names[side]}</Text>
                <Text style={[shared.scoreboardSets, { color: color.ink }]} maxFontSizeMultiplier={1.3}>· Sets {setsWon[side]}</Text>
              </View>
              <Text style={[shared.scoreboardScore, { color: color.ink, fontSize: scoreSize, lineHeight: scoreSize }]} maxFontSizeMultiplier={1}>
                {scores[side]}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => p.onMinus(side)}
              disabled={scores[side] === 0}
              accessibilityRole="button"
              accessibilityLabel={`Take a point away from ${names[side]}`}
              testID={`board-minus-${side}`}
              style={({ pressed }) => [shared.scoreboardMinus, { borderColor: color.fill, backgroundColor: theme.colors.card, opacity: scores[side] === 0 ? 0.4 : pressed ? 0.7 : 1 }]}
            >
              <Text style={[shared.scoreboardSets, { color: theme.colors.text }]} maxFontSizeMultiplier={1.3}>−1 {names[side]}</Text>
            </Pressable>
            </View>
          )
        })}

        <View style={[shared.scoreboardTopBar, { top: pad, left: pad, right: pad }]} pointerEvents="box-none">
          <Pressable onPress={p.onSwitchSides} accessibilityRole="button" accessibilityLabel="Switch sides" testID="board-switch" style={shared.scoreboardIcon}>
            <Ionicons name="swap-horizontal" size={22} color={theme.colors.text} />
          </Pressable>
          <Text style={shared.scoreboardSetLabel} numberOfLines={1} maxFontSizeMultiplier={1.3}>{setLabel}</Text>
          <Pressable onPress={p.onClose} accessibilityRole="button" accessibilityLabel="Back to the upright view" testID="simple-scoreboard-close" style={shared.scoreboardIcon}>
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </Pressable>
        </View>

        {locked && (notice || nextSetLabel) && (
          <View style={[shared.scoreboardNotice, { left: boardW / 2 - 170, top: boardH / 2 - 60 }]} accessibilityRole="alert">
            {!!notice && <Text style={[shared.body, { textAlign: 'center' }]}>{notice}</Text>}
            {!!nextSetLabel && <Button label={nextSetLabel} icon="play" onPress={p.onNextSet} testID="board-next-set" />}
          </View>
        )}
      </View>
    </View>
  )
}
