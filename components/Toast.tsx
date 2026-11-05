import { useEffect, useRef } from 'react'
import { Animated, Platform, TouchableOpacity } from 'react-native'
import { Text } from './ui/Text'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme } from '../constants/theme'
import type { ToastAction } from '../types'

type Variant = 'error' | 'success' | 'info'

type Props = {
  message: string
  variant?: Variant
  visible: boolean
  onHide: () => void
  duration?: number
  /** Optional button on the right (e.g. "Message host"). Tapping it hides the toast. */
  action?: ToastAction
}

const VARIANTS: Record<Variant, { bg: string; icon: string; color: string; text: string }> = {
  error:   { bg: '#FFF0F0', icon: 'alert-circle',       color: theme.colors.error, text: '#2E0F0F' },
  success: { bg: '#F0FFF4', icon: 'checkmark-circle',   color: theme.colors.success, text: '#0F2A1A' },
  info:    { bg: '#F3F0FF', icon: 'information-circle', color: theme.colors.primary, text: '#1C1140' },
}

export function Toast({ message, variant = 'error', visible, onHide, duration = 3500, action }: Props) {
  const insets = useSafeAreaInsets()
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(-12)).current

  useEffect(() => {
    if (!visible) return

    Animated.parallel([
      Animated.timing(opacity,     { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY,  { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start()

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -12, duration: 200, useNativeDriver: true }),
      ]).start(() => onHide())
    }, duration)

    return () => clearTimeout(timer)
  }, [visible])

  if (!visible) return null

  const { bg, icon, color, text } = VARIANTS[variant]

  return (
    <Animated.View
      pointerEvents={action ? 'box-none' : 'none'}
      style={{
        position: 'absolute',
        top: insets.top + theme.spacing.sm,
        left: theme.spacing.md,
        right: theme.spacing.md,
        zIndex: 9999,
        opacity,
        transform: [{ translateY }],
        borderRadius: theme.radius.lg,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: color + '33',
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm + 2,
        ...Platform.select({
          ios: {
            shadowColor: theme.colors.black,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 12,
          },
          android: { elevation: 6 },
          web: { boxShadow: '0 4px 16px rgba(0,0,0,0.10)' } as any,
        }),
      }}
    >
      <Ionicons name={icon as any} size={20} color={color} />
      <Text style={{
        flex: 1,
        fontSize: theme.font.size.sm,
        fontWeight: theme.font.weight.medium,
        color: text,
        lineHeight: theme.font.lineHeight.tight,
      }}>
        {message}
      </Text>
      {action && (
        <TouchableOpacity
          onPress={() => { action.onPress(); onHide() }}
          accessibilityRole="button"
          hitSlop={8}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: theme.spacing.sm }}
          testID="toast-action"
        >
          <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.semibold, color: text, textDecorationLine: 'underline' }}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  )
}
