import React from 'react'
import { View } from 'react-native'
import { shared, theme } from '../../constants'

/**
 * `/host?edit=` on a cold link (the event isn't cached yet): the form's shape
 * — heading, type toggle, field cards — so nothing jumps when the row lands.
 */
export function HostFormSkeleton() {
  return (
    <View style={[shared.screen, { padding: 16 }]} testID="host-form-skeleton" accessibilityLabel="Loading event">
      <View style={[shared.skeletonBlock, { width: 180, height: 32, borderRadius: 10, marginBottom: 8 }]} />
      <View style={[shared.skeletonLabel, { width: 200, marginBottom: 20 }]} />
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        <View style={[shared.skeletonBlock, { flex: 1, height: 64, borderRadius: 18 }]} />
        <View style={[shared.skeletonBlock, { flex: 1, height: 64, borderRadius: 18 }]} />
      </View>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={{ marginBottom: theme.spacing.md }}>
          <View style={shared.skeletonLabel} />
          <View style={shared.skeletonField} />
        </View>
      ))}
    </View>
  )
}
