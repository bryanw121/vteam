import { StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import { ScreenHeader } from '../ui'
import type { EventsHeaderProps } from '../../types'

/**
 * "OCTOBER 2026 / Events." header. Mobile is exactly `ScreenHeader` (no
 * month kicker: the week strip shows the month); the
 * desktop (sidebar) layout uses a larger title inside the padded scroll area,
 * which ScreenHeader has no size for.
 */
export function EventsHeader({ wide, right }: EventsHeaderProps) {
  // Mobile has no kicker: the week strip right below names the month it shows.
  if (!wide) return <ScreenHeader title="Events" titleDot right={right} />
  const kicker = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return (
    <View style={styles.row}>
      <View>
        <Text style={styles.kicker}>{kicker}</Text>
        <Text style={styles.title} accessibilityRole="header">
          Events<Text style={styles.dot}>.</Text>
        </Text>
      </View>
      {right}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 },
  kicker: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    letterSpacing: 1.3,
    color: theme.colors.subtext,
    textTransform: 'uppercase',
  },
  title: { fontFamily: theme.fonts.display, fontSize: theme.font.heading.hero, lineHeight: 46, letterSpacing: -1.6, color: theme.colors.text, marginTop: 2 },
  dot: { color: theme.colors.primaryText },
})
