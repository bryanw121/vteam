import { Pressable, StyleSheet, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import type { MatchSummary } from '../../types'

type Props = {
  match: MatchSummary
  onPress: () => void
  /** "Resume" styling for a match still in progress. */
  highlight?: boolean
}

/** A saved scorekeeper match: teams, score, and a Resume cue while it is live. */
export function MatchRow({ match, onPress, highlight }: Props) {
  const live = match.status === 'live'
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${live ? 'Resume' : 'Open'} ${match.title}, ${match.score}`}
      testID={`match-row-${match.id}`}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        highlight && styles.highlight,
        (pressed || hovered) && { opacity: 0.85 },
      ]}
    >
      <View style={[styles.icon, live ? styles.iconLive : null]}>
        <Ionicons name={live ? 'play' : 'checkmark-done'} size={18} color={live ? theme.colors.onPrimary : theme.colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        {highlight && <Text style={styles.kicker}>Match in progress</Text>}
        <Text style={styles.title} numberOfLines={1}>{match.title}</Text>
        <Text style={styles.score} numberOfLines={1}>{match.score}</Text>
      </View>
      <Text style={styles.cta}>{live ? 'Resume' : 'View'}</Text>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.subtext} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    minHeight: 64,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  highlight: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  icon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  iconLive: { backgroundColor: theme.colors.primary },
  kicker: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.timeInk, textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.text },
  score: { fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtextStrong },
  cta: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm, color: theme.colors.primary },
})
