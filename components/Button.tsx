import { TouchableOpacity, StyleProp, ViewStyle } from 'react-native'
import { Text } from './ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme } from '../constants'
import type { IoniconName } from '../types'
import { Spinner } from './ui/Spinner'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'touch'
type Props = {
  label: string
  onPress: () => void
  loading?: boolean
  variant?: Variant
  disabled?: boolean
  /**
   * 'md' (default) is the existing look; 'sm' is a compact 36pt-tall button;
   * 'touch' has sm's padding but a 44pt minimum height, for toolbars (e.g. the
   * event header) where the touch target matters.
   */
  size?: Size
  /** Leading icon, coloured to match the label. */
  icon?: IoniconName
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
  /** Default true (stretch to the parent, as before). False shrinks to content. */
  fullWidth?: boolean
  testID?: string
}

export function Button({
  label, onPress, loading, variant = 'primary', disabled,
  size = 'md', icon, style, accessibilityLabel, fullWidth = true, testID,
}: Props) {
  const buttonStyle = {
    primary: shared.buttonPrimary,
    secondary: shared.buttonSecondary,
    danger: shared.buttonDanger,
    ghost: shared.buttonGhost,
  }[variant]
  const tinted = variant === 'secondary' || variant === 'ghost'
  const labelStyle = tinted ? shared.buttonLabelSecondary : shared.buttonLabelPrimary
  const inactive = !!(disabled || loading)
  const contentColor = tinted ? theme.colors.primary : theme.colors.onPrimary
  const iconSize = size === 'sm' ? 14 : 16
  const compact = size === 'sm' || size === 'touch'

  return (
    <TouchableOpacity
      style={[
        shared.buttonBase,
        buttonStyle,
        size === 'sm' && shared.buttonSm,
        size === 'touch' && shared.buttonTouch,
        !fullWidth && shared.buttonAuto,
        !!icon && !loading && shared.buttonWithIcon,
        inactive && shared.buttonDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={inactive ? { disabled: true, busy: !!loading } : undefined}
    >
      {loading
        ? <Spinner color={tinted ? theme.colors.primary : theme.colors.white} />
        : (
          <>
            {icon && <Ionicons name={icon} size={iconSize} color={contentColor} />}
            <Text style={[labelStyle, compact && shared.buttonLabelSm]}>{label}</Text>
          </>
        )
      }
    </TouchableOpacity>
  )
}
