import { useState } from 'react'
import { View } from 'react-native'
import { Text } from '../ui/Text'
import { Button } from '../Button'
import { shared, theme } from '../../constants'
import { Sentry } from '../../lib/sentry'
import type { ScoresheetPreviewProps } from '../../types'

/**
 * Native: opens the system print preview of the finished scoresheet, where it can be printed,
 * saved to Files as a PDF, or shared. expo-print is loaded on demand so an older app build
 * without it explains instead of crashing.
 */
export function ScoresheetPreview({ html, children }: ScoresheetPreviewProps) {
  const [error, setError] = useState<string | null>(null)
  async function open() {
    setError(null)
    try {
      const Print = await import('expo-print')
      await Print.printAsync({ html, orientation: Print.Orientation.landscape })
    } catch (err) {
      Sentry.captureException(err)
      setError('PDF export needs the latest version of the app.')
    }
  }
  return (
    <View style={{ gap: theme.spacing.md }}>
      <Button label="Preview, print or save PDF" icon="document-text-outline" onPress={() => void open()} testID="sheet-print" />
      {!!error && <Text style={[shared.caption, { color: theme.colors.error }]}>{error}</Text>}
      {children}
    </View>
  )
}
