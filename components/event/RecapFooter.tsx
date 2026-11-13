import React from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { shared, theme } from '../../constants'
import type { RecapFooterProps } from '../../types'

/**
 * The footer of a finished game (#227), in place of JoinFooter: never Join,
 * Leave, +1 guest or spots left. Players who were there get Share your game and
 * Give cheers; everyone else just sees that the game is over.
 */
export function RecapFooter({ attended, onShare, onGiveCheers, sharing, docScrollActive, bottomInset, onHeightChange }: RecapFooterProps) {
  return (
    <View
      testID="recap-footer"
      onLayout={e => onHeightChange?.(e.nativeEvent.layout.height)}
      style={[shared.recapFooter, { position: (docScrollActive ? 'fixed' : 'absolute') as 'absolute', paddingBottom: Math.max(bottomInset, theme.spacing.md) }]}
    >
      {attended ? (
        <>
          <TouchableOpacity
            onPress={onShare}
            disabled={sharing}
            style={[shared.buttonBase, shared.buttonPrimary, { flex: 1 }, sharing && shared.buttonDisabled]}
            accessibilityRole="button"
            testID="recap-share"
          >
            <Text style={shared.buttonLabelPrimary}>{sharing ? 'Getting your picture…' : 'Share your game'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onGiveCheers} style={[shared.buttonBase, shared.buttonSecondary, { flex: 1 }]} accessibilityRole="button" testID="recap-cheers">
            <Text style={shared.buttonLabelSecondary}>Give cheers</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={[shared.caption, { flex: 1, textAlign: 'center', paddingVertical: theme.spacing.sm }]}>This game is over.</Text>
      )}
    </View>
  )
}
