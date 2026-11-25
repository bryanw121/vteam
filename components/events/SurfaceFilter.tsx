import { ScrollView, StyleSheet, View } from 'react-native'
import { SURFACE_OPTIONS, theme } from '../../constants'
import { Chip } from '../ui'
import type { SurfaceFilterProps } from '../../types'

/**
 * Events-tab surface filter (Indoor / Sand / Grass). Combines with the chip
 * filter above it; tapping the active surface again clears it. Club events
 * use the host's `events.surface`, outside sessions the venue's surface from
 * Schelagg; items with no surface only show when no surface is picked.
 */
export function SurfaceFilter({ active, onSelect, wide, bare }: SurfaceFilterProps) {
  const items = SURFACE_OPTIONS.map(opt => (
    <Chip
      key={opt.id}
      testID={`surface-${opt.id}`}
      label={opt.label}
      variant="tint"
      active={active === opt.id}
      onPress={() => onSelect(active === opt.id ? 'any' : opt.id)}
    />
  ))

  if (bare) return <>{items}</>
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
  wrap: { flexDirection: 'row', gap: 6, marginTop: -10, marginBottom: 18, flexWrap: 'wrap' },
  scroll: { flexGrow: 0 },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
})
