import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import { POSITION_LABELS, courtOf } from '../../lib/scoresheet/engine'
import type { TeamSetState, TeamSide } from '../../types'
import { TEAM_COLORS } from './teamColors'

type Props = {
  side: TeamSide
  team: TeamSetState
  serving: boolean
  names: Map<number, string>
  onPressPlayer?: (player: number) => void
}

// Front row IV III II, back row V VI I: how the court looks from behind the end line.
const ROWS = [[3, 2, 1], [4, 5, 0]] as const

/** One team's six positions, the server highlighted and the libero marked. */
export function CourtGrid({ side, team, serving, names, onPressPlayer }: Props) {
  const court = courtOf(team)
  const color = TEAM_COLORS[side]
  return (
    <View style={styles.court} accessibilityLabel={`Rotation, team ${side}`}>
      {ROWS.map((row, r) => (
        <View key={r} style={[styles.row, r === 0 && styles.front]}>
          {row.map(position => {
            const spot = court[position]
            const isServer = serving && position === 0
            const first = names.get(spot.player)?.split(' ')[0]
            return (
              <Pressable
                key={position}
                onPress={onPressPlayer ? () => onPressPlayer(spot.player) : undefined}
                disabled={!onPressPlayer}
                accessibilityRole="button"
                accessibilityLabel={`Position ${POSITION_LABELS[position]}: ${spot.libero ? 'libero ' : ''}#${spot.player}${first ? ` ${first}` : ''}${isServer ? ', serving' : ''}`}
                testID={`court-${side}-${position}`}
                style={[styles.cell, isServer && { backgroundColor: color.fill, borderColor: color.fill }, spot.libero && !isServer && styles.libero]}
              >
                <Text style={[styles.pos, isServer && { color: color.ink }]} maxFontSizeMultiplier={1.15}>{POSITION_LABELS[position]}</Text>
                <Text style={[styles.num, isServer && { color: color.ink }]} maxFontSizeMultiplier={1.15}>{spot.player}</Text>
                {!!first && <Text style={[styles.name, isServer && { color: color.ink }]} numberOfLines={1} maxFontSizeMultiplier={1.15}>{first}</Text>}
              </Pressable>
            )
          })}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  court: { gap: 4, flex: 1 },
  row: { flexDirection: 'row', gap: 4 },
  front: { borderBottomWidth: 2, borderBottomColor: theme.colors.border, paddingBottom: 4 },
  cell: {
    flex: 1,
    minHeight: 52,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  libero: { borderColor: theme.colors.warning, borderStyle: 'dashed' },
  pos: { position: 'absolute', top: 2, left: 4, fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext },
  num: { fontFamily: theme.fonts.display, fontSize: theme.font.size.lg, color: theme.colors.text },
  name: { fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtextStrong, maxWidth: '90%' },
})
