import { Pressable, StyleSheet } from 'react-native'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import { POSITION_LABELS } from '../../lib/scoresheet/engine'

type Props = {
  position: number
  number?: number | null
  name?: string
  /** Filled with the team color (the server, or the spot being edited). */
  highlight?: { fill: string; ink: string } | null
  libero?: boolean
  /** Empty spot prompt. */
  placeholder?: string
  onPress?: () => void
  accessibilityLabel: string
  testID?: string
}

/** One player spot on the court: position label, number, first name. */
export function CourtSpot({ position, number, name, highlight, libero, placeholder = '+', onPress, accessibilityLabel, testID }: Props) {
  const first = name?.split(' ')[0]
  const ink = highlight ? highlight.ink : undefined
  const empty = number == null
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.spot,
        empty && styles.empty,
        libero && !highlight && styles.libero,
        highlight && { backgroundColor: highlight.fill, borderColor: highlight.fill, borderStyle: 'solid' },
        (pressed || hovered) && !!onPress && !highlight && { borderColor: theme.colors.primary },
      ]}
    >
      <Text style={[styles.pos, ink ? { color: ink } : null]} maxFontSizeMultiplier={1.15}>{POSITION_LABELS[position]}</Text>
      <Text style={[empty ? styles.plus : styles.num, ink ? { color: ink } : null]} maxFontSizeMultiplier={1.15}>{empty ? placeholder : number}</Text>
      {!!first && <Text style={[styles.name, ink ? { color: ink } : null]} numberOfLines={1} maxFontSizeMultiplier={1.15}>{first}</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  spot: {
    minHeight: 58,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  empty: { borderStyle: 'dashed' },
  libero: { borderColor: theme.colors.warning, borderStyle: 'dashed' },
  pos: { position: 'absolute', top: 2, left: 5, fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext },
  num: { fontFamily: theme.fonts.display, fontSize: theme.font.size.xl, color: theme.colors.text },
  plus: { fontFamily: theme.fonts.body, fontSize: theme.font.size.xl, color: theme.colors.subtext },
  name: { fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtextStrong, maxWidth: '92%' },
})
