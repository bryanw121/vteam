import React from 'react'
import { TouchableOpacity } from 'react-native'
import { Text } from '../ui/Text'
import { Spinner } from '../ui/Spinner'
import { theme } from '../../constants'
import type { HostSubmitButtonProps } from '../../types'

/** Publish / Save changes at the bottom of the host form. Greyed while it can't save; a spinner while saving. */
export function HostSubmitButton({ disabled, busy, label, onPress }: HostSubmitButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      activeOpacity={0.85}
      style={{
        marginTop: 8,
        padding: 15, borderRadius: 14,
        backgroundColor: disabled ? theme.colors.border : theme.colors.text,
        alignItems: 'center',
      }}
    >
      {busy
        ? <Spinner color={theme.colors.background} />
        : <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.lgs, letterSpacing: 0.2, color: theme.colors.background }}>
            {label}
          </Text>
      }
    </TouchableOpacity>
  )
}
