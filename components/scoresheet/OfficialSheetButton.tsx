import { useState } from 'react'
import { View } from 'react-native'
import { Text } from '../ui/Text'
import { Button } from '../Button'
import { shared, theme } from '../../constants'
import { Sentry } from '../../lib/sentry'
import type { OfficialSheetButtonProps } from '../../types'

/**
 * Fills the official USA Volleyball scoresheet (the real form, any match format) and hands it
 * over: a download on web, the print / save / share sheet on phones. pdf-lib and the blank form
 * load only when tapped.
 */
export function OfficialSheetButton({ doc, state }: OfficialSheetButtonProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function exportSheet() {
    setBusy(true)
    setError(null)
    try {
      const [{ officialScoresheetPdf, officialFileName }, { deliverPdf }] = await Promise.all([
        import('../../lib/scoresheet/officialPdf'),
        import('../../lib/scoresheet/deliverPdf'),
      ])
      await deliverPdf(await officialScoresheetPdf(doc, state), officialFileName(doc))
    } catch (err) {
      Sentry.captureException(err)
      setError("Couldn't make the official form. Update the app, or try again.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <View style={{ gap: theme.spacing.xs, marginBottom: theme.spacing.sm }}>
      <Button label="Official USA Volleyball form (PDF)" icon="document-text-outline" variant="secondary" onPress={() => void exportSheet()} loading={busy} testID="sheet-official" />
      <Text style={shared.caption}>
        {state.sets.length > 2 ? `The form holds two sets, so this match fills ${Math.ceil(state.sets.length / 2)} sheets.` : 'Filled in on the real two-set scoresheet, ready to print or hand in.'}
      </Text>
      {!!error && <Text style={[shared.caption, { color: theme.colors.error }]}>{error}</Text>}
    </View>
  )
}
