import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { COMPACT_TEXT_SCALE, theme } from '../../constants'
import type { MetricsTab } from '../../types'

type Props = {
  active: MetricsTab
  onChange: (tab: MetricsTab) => void
}

const TABS: { id: MetricsTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'live', label: 'Live' },
  { id: 'people', label: 'People' },
  { id: 'retention', label: 'Retention' },
  { id: 'reports', label: 'Reports' },
]

/** The Metrics sections, as a segmented control. */
export function MetricsTabs({ active, onChange }: Props) {
  return (
    <View style={styles.bar} role="tablist" aria-label="Metrics sections">
      {TABS.map(tab => {
        const on = tab.id === active
        return (
          <Pressable
            key={tab.id}
            role="tab"
            aria-selected={on}
            onPress={() => onChange(tab.id)}
            testID={`metrics-tab-${tab.id}`}
            style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.tab, on && styles.tabOn, !on && hovered && styles.tabHover]}
          >
            <Text style={[styles.label, on && styles.labelOn]} maxFontSizeMultiplier={COMPACT_TEXT_SCALE} numberOfLines={1}>{tab.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.sm + 2 },
  tabOn: { backgroundColor: theme.colors.primarySoft },
  tabHover: { backgroundColor: theme.colors.borderSoft },
  label: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.subtextStrong },
  labelOn: { color: theme.colors.text },
})
