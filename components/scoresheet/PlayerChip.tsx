import { Pressable, StyleSheet } from 'react-native'
import { Text } from '../ui/Text'
import { theme } from '../../constants'

type Props = {
  number: number
  name?: string
  selected?: boolean
  disabled?: boolean
  /** Marks a libero (shown with an L). */
  libero?: boolean
  onPress: () => void
  testID?: string
}

/** A jersey number to pick: 44pt tall, with the first name when there is room. */
export function PlayerChip({ number, name, selected, disabled, libero, onPress, testID }: Props) {
  const first = name?.split(' ')[0]
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      role="radio"
      aria-checked={!!selected}
      accessibilityLabel={`${libero ? 'Libero ' : ''}#${number}${name ? ` ${name}` : ''}`}
      testID={testID}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.chip,
        selected && styles.selected,
        disabled && styles.disabled,
        (pressed || hovered) && !disabled && !selected && { borderColor: theme.colors.primary },
      ]}
    >
      <Text style={[styles.num, selected && styles.numSel]} maxFontSizeMultiplier={1.3}>
        {number}
        {libero ? <Text style={styles.l}> L</Text> : null}
      </Text>
      {!!first && <Text style={[styles.name, selected && styles.numSel]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{first}</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: {
    minWidth: 52,
    minHeight: 44,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  disabled: { opacity: 0.35 },
  num: { fontFamily: theme.fonts.display, fontSize: theme.font.size.lg, color: theme.colors.text },
  numSel: { color: theme.colors.onPrimary },
  l: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.warning },
  name: { fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtextStrong, maxWidth: 72 },
})
