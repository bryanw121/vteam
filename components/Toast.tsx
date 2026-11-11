import { useEffect, useRef } from 'react'
import { Animated, Platform, TouchableOpacity, View } from 'react-native'
import { Text } from './ui/Text'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme } from '../constants/theme'
import type { ToastAction, ToastVariant } from '../types'

type Props = {
  message: string
  /** Bold first line (e.g. "Couldn't join"). */
  title?: string
  variant?: ToastVariant
  visible: boolean
  onHide: () => void
  duration?: number
  /** Optional button on the right (e.g. "Message host"). Tapping it hides the toast. */
  action?: ToastAction
}

const VARIANTS: Record<ToastVariant, { bg: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  error:   { bg: theme.colors.toastErrorBg,   icon: 'alert-circle',       color: theme.colors.error },
  warning: { bg: theme.colors.toastWarningBg, icon: 'warning',            color: theme.colors.warning },
  success: { bg: theme.colors.toastSuccessBg, icon: 'checkmark-circle',   color: theme.colors.success },
  info:    { bg: theme.colors.toastInfoBg,    icon: 'information-circle', color: theme.colors.primaryText },
}

/**
 * A message across the top of the screen that hides itself. Announced to
 * screen readers (role alert, polite live region). Usually drawn by
 * `ToastHost` from `lib/toast`; a screen may still render one directly.
 */
export function Toast({ message, title, variant = 'error', visible, onHide, duration = 3500, action }: Props) {
  const insets = useSafeAreaInsets()
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(-12)).current
  const onHideRef = useRef(onHide)
  onHideRef.current = onHide

  useEffect(() => {
    if (!visible) return
    opacity.setValue(0)
    translateY.setValue(-12)
    Animated.parallel([
      Animated.timing(opacity,     { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(translateY,  { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== 'web' }),
    ]).start()

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(translateY, { toValue: -12, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
      ]).start(() => onHideRef.current())
    }, duration)

    return () => clearTimeout(timer)
  }, [visible, message, title, duration]) // eslint-disable-line react-hooks/exhaustive-deps -- restart for a replacing message

  if (!visible) return null

  const { bg, icon, color } = VARIANTS[variant]

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: Platform.OS === 'web' ? ('fixed' as 'absolute') : 'absolute',
        top: insets.top + theme.spacing.sm,
        left: theme.spacing.md,
        right: theme.spacing.md,
        alignItems: 'center',
        zIndex: 9999,
        opacity,
        transform: [{ translateY }],
      }}
    >
      <View
        role="alert"
        aria-live="polite"
        accessibilityLiveRegion="polite"
        testID="toast"
        style={{
          width: '100%',
          maxWidth: 560,
          borderRadius: theme.radius.lg,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: color,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingLeft: theme.spacing.md,
          paddingRight: theme.spacing.xs,
          paddingVertical: theme.spacing.xs,
          minHeight: 52,
          ...Platform.select({
            ios: { shadowColor: theme.colors.black, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
            android: { elevation: 6 },
            web: { boxShadow: '0 6px 20px rgba(0,0,0,0.35)' } as object,
          }),
        }}
      >
        <Ionicons name={icon} size={20} color={color} aria-hidden />
        <View style={{ flex: 1, paddingVertical: theme.spacing.xs }}>
          {title ? (
            <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>{title}</Text>
          ) : null}
          <Text style={{ fontSize: theme.font.size.sm, fontWeight: title ? theme.font.weight.regular : theme.font.weight.medium, color: theme.colors.text, lineHeight: theme.font.lineHeight.tight }}>
            {message}
          </Text>
        </View>
        {action && (
          <TouchableOpacity
            onPress={() => { action.onPress(); onHideRef.current() }}
            accessibilityRole="button"
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: theme.spacing.sm }}
            testID="toast-action"
          >
            <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.semibold, color: theme.colors.text, textDecorationLine: 'underline' }}>{action.label}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => onHideRef.current()}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
          testID="toast-dismiss"
        >
          <Ionicons name="close" size={18} color={theme.colors.subtextStrong} aria-hidden />
        </TouchableOpacity>
      </View>
    </Animated.View>
  )
}
