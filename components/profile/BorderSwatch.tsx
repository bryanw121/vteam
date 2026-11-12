import { Pressable, View } from 'react-native'
import { Text } from '../ui/Text'
import { LinearGradient } from 'expo-linear-gradient'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme } from '../../constants/theme'
import type { ProfileBorderDef } from '../../constants/badges'

type Props = {
  label: string
  /** The border to preview (its `ringColors` drive the swatch). Omit for the "None" option. */
  borderDef?: ProfileBorderDef
  selected: boolean
  unlocked: boolean
  onPress: () => void
  /** `sm` on the profile editor, `lg` on the Badges settings screen. */
  size?: 'sm' | 'lg'
  /** Lock-hint shown under a locked swatch (and used as the accessibility hint). */
  description?: string
  disabled?: boolean
}

const SIZES = {
  sm: { swatch: 52, ring: 3, check: 18, checkIcon: 10, lockIcon: 14, noneIcon: 18 },
  lg: { swatch: 64, ring: 4, check: 20, checkIcon: 11, lockIcon: 18, noneIcon: 22 },
} as const

/** One option in a profile-border picker. Driven entirely by `PROFILE_BORDERS` data. */
export function BorderSwatch({ label, borderDef, selected, unlocked, onPress, size = 'sm', description, disabled = false }: Props) {
  const dim = SIZES[size]
  const outer = dim.swatch + dim.ring * 2
  const blocked = !unlocked || disabled

  const ring = borderDef ? (
    <View style={{ width: outer, height: outer, borderRadius: outer / 2, overflow: 'hidden', opacity: unlocked ? 1 : 0.3 }}>
      <LinearGradient colors={borderDef.ringColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <View style={{
        position: 'absolute', top: dim.ring, left: dim.ring, right: dim.ring, bottom: dim.ring,
        borderRadius: dim.swatch / 2, backgroundColor: theme.colors.card,
        alignItems: 'center', justifyContent: 'center',
      }}>
        {!unlocked && <Ionicons name="lock-closed" size={dim.lockIcon} color={theme.colors.subtext} />}
      </View>
    </View>
  ) : (
    <View style={{
      width: dim.swatch, height: dim.swatch, borderRadius: dim.swatch / 2,
      borderWidth: 2, borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Ionicons name="close" size={dim.noneIcon} color={theme.colors.subtext} />
    </View>
  )

  return (
    <Pressable
      onPress={onPress}
      disabled={blocked}
      role="radio"
      aria-checked={selected}
      aria-disabled={!unlocked}
      aria-label={unlocked ? label : `${label}, locked`}
      accessibilityHint={description}
      style={({ pressed }) => ({ alignItems: 'center', gap: theme.spacing.xs, opacity: pressed && unlocked ? 0.7 : 1 })}
    >
      <View style={{ position: 'relative' }}>
        {ring}
        {selected && unlocked && (
          <View style={{
            position: 'absolute', bottom: -2, right: -2,
            width: dim.check, height: dim.check, borderRadius: dim.check / 2,
            backgroundColor: theme.colors.primary,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: theme.colors.card,
          }}>
            <Ionicons name="checkmark" size={dim.checkIcon} color={theme.colors.onPrimary} />
          </View>
        )}
      </View>
      <Text style={{
        fontSize: theme.font.size.xs,
        fontWeight: selected ? theme.font.weight.semibold : theme.font.weight.regular,
        color: unlocked ? theme.colors.text : theme.colors.subtext,
        opacity: unlocked ? 1 : 0.5,
      }}>
        {label}
      </Text>
      {!unlocked && description ? (
        <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext, textAlign: 'center', maxWidth: 72, opacity: 0.7 }} numberOfLines={2}>
          {description}
        </Text>
      ) : null}
    </Pressable>
  )
}
