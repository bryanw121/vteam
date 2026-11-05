import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import type { TeamSide } from '../../types'
import { TEAM_COLORS } from './teamColors'

type Props = {
  /** One court spot: the team and its position (0 = I ... 5 = VI). */
  renderSpot: (side: TeamSide, position: number) => ReactNode
  /** Shown above team A's end line and below team B's (name, serving ball). */
  renderLabel?: (side: TeamSide) => ReactNode
}

/**
 * The court seen from the scorer's table: team A's half on top, the net across the middle,
 * team B's half below. Each team's front row is at the net. Team A faces down the page, so its
 * positions read mirrored (II III IV at the net, I VI V at the back); team B reads the way a team
 * sees its own court (IV III II at the net, V VI I at the back). Position I is always the server's
 * spot, in the right back corner from that team's point of view.
 */
const ROWS: Record<TeamSide, readonly (readonly number[])[]> = {
  A: [[0, 5, 4], [1, 2, 3]],
  B: [[3, 2, 1], [4, 5, 0]],
}

export function CourtLayout({ renderSpot, renderLabel }: Props) {
  const half = (side: TeamSide) => (
    <View style={[styles.half, { borderColor: TEAM_COLORS[side].fill }]} accessibilityLabel={`Team ${side} side of the court`}>
      {ROWS[side].map((row, r) => (
        <View key={r} style={[styles.row, side === 'A' ? r === 1 && styles.frontA : r === 0 && styles.frontB]}>
          {row.map(position => (
            <View key={position} style={styles.spot}>{renderSpot(side, position)}</View>
          ))}
        </View>
      ))}
    </View>
  )
  return (
    <View style={styles.court}>
      {renderLabel?.('A')}
      {half('A')}
      <View style={styles.net} accessibilityLabel="Net">
        <View style={styles.netLine} />
        <Text style={styles.netText} maxFontSizeMultiplier={1.15}>NET</Text>
        <View style={styles.netLine} />
      </View>
      {half('B')}
      {renderLabel?.('B')}
    </View>
  )
}

const styles = StyleSheet.create({
  court: { gap: theme.spacing.xs, width: '100%', maxWidth: 520, alignSelf: 'center' },
  half: {
    gap: 6,
    padding: 6,
    borderRadius: theme.radius.md,
    borderWidth: 2,
    backgroundColor: theme.colors.background,
  },
  row: { flexDirection: 'row', gap: 6 },
  // The attack line: front row sits between it and the net.
  frontA: { borderTopWidth: 2, borderTopColor: theme.colors.border, borderStyle: 'dashed', paddingTop: 6 },
  frontB: { borderBottomWidth: 2, borderBottomColor: theme.colors.border, borderStyle: 'dashed', paddingBottom: 6 },
  spot: { flex: 1 },
  net: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.xs },
  netLine: { flex: 1, height: 4, borderRadius: 2, backgroundColor: theme.colors.text },
  netText: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.text, letterSpacing: 2 },
})
