import { Pressable, View } from 'react-native'
import { Text } from '../ui/Text'
import { ProfileAvatar } from '../ProfileAvatar'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme } from '../../constants/theme'
import type { ProfileBorderDef } from '../../constants/badges'


type Props = {
  label: string
  /** The border to preview (uses the same renderer as the profile). Omit for the "None" option. */
  borderDef?: ProfileBorderDef
  avatarUri?: string | null
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
export function BorderSwatch({ label, borderDef, selected, unlocked, onPress, size = 'sm', description, disabled = false, avatarUri = null }: Props) {
  const dim = SIZES[size]
  const outer = dim.swatch + dim.ring * 2
  const blocked = !unlocked || disabled

  const ring = (
    <View style={{ width: outer + 4, height: outer + 4, alignItems: 'center', justifyContent: 'center' }}>
      <ProfileAvatar uri={avatarUri} border={borderDef?.type ?? null} size={dim.swatch} />
      {!unlocked && (
        <View style={{ position: 'absolute', bottom: 0, right: 0, padding: 3, borderRadius: 12, backgroundColor: theme.colors.card }}>
          <Ionicons name="lock-closed" size={dim.lockIcon} color={theme.colors.subtext} />
        </View>
      )}
    </View>
  )

  return (
    <Pressable
      onPress={onPress}
      disabled={blocked}
      role="radio"
      aria-checked={selected}
      aria-disabled={blocked}
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
