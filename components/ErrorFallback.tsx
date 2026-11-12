import React from 'react'
import { View, TouchableOpacity } from 'react-native'
import { Text } from './ui/Text'
import { theme } from '../constants'

type Props = { resetError: () => void }

/** What SentryErrorBoundary shows after a render error (shared by the native and web boundaries). */
export function ErrorFallback({ resetError }: Props) {
  return (
    <View style={{
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 48,
      gap: theme.spacing.md,
      backgroundColor: theme.colors.background,
    }}>
      <Text style={{ fontSize: theme.font.size.lg, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
        Something went wrong
      </Text>
      <Text style={{ fontSize: theme.font.size.md, color: theme.colors.subtext, textAlign: 'center', lineHeight: 22 }}>
        An unexpected error occurred. We've been notified and are working on it.
      </Text>
      <TouchableOpacity
        onPress={resetError}
        style={{
          marginTop: theme.spacing.sm,
          backgroundColor: theme.colors.primary,
          paddingHorizontal: theme.spacing.xl,
          paddingVertical: theme.spacing.md,
          borderRadius: theme.radius.md,
        }}
      >
        <Text style={{ color: theme.colors.white, fontWeight: theme.font.weight.semibold }}>
          Try Again
        </Text>
      </TouchableOpacity>
    </View>
  )
}
