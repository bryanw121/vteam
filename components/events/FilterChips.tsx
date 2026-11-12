import { ScrollView, StyleSheet, View } from 'react-native'
import { theme } from '../../constants'
import { Chip } from '../ui'
import type { FilterChipsProps } from '../../types'

/** The Events filter row. Desktop wraps; mobile scrolls sideways under the week strip. */
export function FilterChips({ chips, active, onSelect, wide }: FilterChipsProps) {
  const items = chips.map(chip => (
    <Chip
      key={chip.id}
      testID={`filter-${chip.id}`}
      label={chip.label}
      active={active === chip.id}
      onPress={() => onSelect(chip.id)}
    />
  ))

  if (wide) return <View style={styles.wrap}>{items}</View>
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.scroll}
    >
      {items}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 6, marginBottom: 18, flexWrap: 'wrap' },
  scroll: { flexGrow: 0 },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
})
