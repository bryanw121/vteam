import { Pressable, View, useWindowDimensions } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../ui/Text'
import { TEAM_COLORS } from './teamColors'
import { shared, theme } from '../../constants'
import type { SimpleScoreboardProps, TeamSide } from '../../types'

/** Share of the board's height the score numbers take. */
const SCORE_HEIGHT_SHARE = 0.48

/**
 * The score, sideways and as big as it gets, to show people around the court. Drawn landscape
 * whatever the phone does: when the screen is already landscape it fills it as is; when it's
 * portrait (an app locked to portrait, or rotation lock on) it's turned a quarter, so tilting the
 * phone reads it. Display only: tapping the board doesn't score.
 */
export function SimpleScoreboard({ names, scores, setsWon, serving, order, setLabel, onClose }: SimpleScoreboardProps) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const rotate = height > width
  // The board's own size, in landscape terms.
  const boardW = rotate ? height : width
  const boardH = rotate ? width : height
  const scoreSize = Math.round(boardH * SCORE_HEIGHT_SHARE)
  const pad = Math.max(insets.left, insets.right, insets.top, insets.bottom, theme.spacing.md)

  return (
    <View style={shared.scoreboardRoot} accessibilityViewIsModal testID="simple-scoreboard">
      <View
        style={[
          { width: boardW, height: boardH, flexDirection: 'row', padding: pad, gap: theme.spacing.md },
          rotate && { position: 'absolute', left: (width - boardW) / 2, top: (height - boardH) / 2, transform: [{ rotate: '90deg' }] },
        ]}
      >
        {order.map((side: TeamSide) => {
          const color = TEAM_COLORS[side]
          return (
            <View
              key={side}
              style={[shared.scoreboardHalf, { backgroundColor: color.fill }]}
              accessibilityLabel={`${names[side]} ${scores[side]}${serving === side ? ', serving' : ''}, sets ${setsWon[side]}`}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                {serving === side && <Ionicons name="tennisball" size={20} color={color.ink} />}
                <Text style={[shared.scoreboardTeam, { color: color.ink }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{names[side]}</Text>
              </View>
              <Text style={[shared.scoreboardScore, { color: color.ink, fontSize: scoreSize, lineHeight: scoreSize }]} maxFontSizeMultiplier={1}>
                {scores[side]}
              </Text>
              <Text style={[shared.scoreboardSets, { color: color.ink }]} maxFontSizeMultiplier={1.3}>Sets {setsWon[side]}</Text>
            </View>
          )
        })}
        <Text style={shared.scoreboardSetLabel} maxFontSizeMultiplier={1.3}>{setLabel}</Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close the scoreboard"
          testID="simple-scoreboard-close"
          style={[shared.scoreboardClose, { top: pad, right: pad }]}
        >
          <Ionicons name="close" size={26} color={theme.colors.text} />
        </Pressable>
      </View>
    </View>
  )
}
