import { StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import { localDateKey, parseEventDate } from '../../utils'
import type { NextUpCardProps } from '../../types'

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/**
 * The pill on the desktop "Next up" card: TONIGHT (today from 5pm) / TODAY /
 * TOMORROW, the weekday within the coming week, else a short date ("NOV 14").
 */
export function nextUpLabel(eventDate: string, now: Date = new Date()): string {
  const d = parseEventDate(eventDate)
  const dayKey = localDateKey(d)
  if (dayKey === localDateKey(now)) return d.getHours() >= 17 ? 'TONIGHT' : 'TODAY'
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  if (dayKey === localDateKey(tomorrow)) return 'TOMORROW'
  const weekOut = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7)
  if (d < weekOut) return WEEKDAYS[d.getDay()]
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
}

/** Desktop right-rail card for the next club event in the feed. */
export function NextUpCard({ event, onPress }: NextUpCardProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.card} accessibilityRole="button" testID="next-up-card">
      <View style={styles.pillRow}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{nextUpLabel(event.event_date)}</Text>
        </View>
      </View>
      <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
      {!!event.location && <Text style={styles.location} numberOfLines={1}>{event.location}</Text>}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.lg, padding: 14, marginBottom: 6 },
  pillRow: { flexDirection: 'row', gap: 6, marginBottom: theme.spacing.sm },
  pill: { paddingHorizontal: theme.spacing.sm, paddingVertical: 3, borderRadius: theme.radius.full, backgroundColor: theme.colors.accent },
  pillText: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.accentInk },
  title: { fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.lgm, letterSpacing: -0.3, color: theme.colors.onPrimary, marginBottom: theme.spacing.xs },
  // Same look as the old rgba(255,255,255,0.7) without a literal.
  location: { fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.onPrimary, opacity: 0.7 },
})
