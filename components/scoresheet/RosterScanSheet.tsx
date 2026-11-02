import { useEffect, useState } from 'react'
import { ActivityIndicator, Platform, View } from 'react-native'
import { Text } from '../ui/Text'
import { BottomSheet } from '../ui'
import { Button } from '../Button'
import { PlayerChip } from './PlayerChip'
import { Row, SheetBody, SheetLabel } from './SheetParts'
import { shared, theme } from '../../constants'
import { pickRosterPhoto, readRoster, RosterScanError, type PhotoSource } from '../../lib/scoresheet/scanRoster'
import { Sentry } from '../../lib/sentry'
import type { RosterPlayer, RosterScanResult } from '../../types'

type Props = {
  visible: boolean
  teamLabel: string
  /** Numbers already on this team (skipped from the scan). */
  existing: number[]
  /** True when the team's court is still empty, so the first six can start there. */
  courtEmpty: boolean
  onAdd: (players: RosterPlayer[], opts: { fillCourt: boolean; teamName: string | null }) => void
  onDismiss: () => void
}

type Step = { kind: 'choose' } | { kind: 'reading' } | { kind: 'review'; result: RosterScanResult } | { kind: 'error'; message: string }

/**
 * "Scan roster": photograph or pick a photo of a roster, lineup card or team list; the names and
 * numbers it reads come back as chips to check before anything is added.
 */
export function RosterScanSheet({ visible, teamLabel, existing, courtEmpty, onAdd, onDismiss }: Props) {
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const [picked, setPicked] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (visible) setStep({ kind: 'choose' })
  }, [visible])

  async function scan(source: PhotoSource) {
    try {
      const photo = await pickRosterPhoto(source)
      if (!photo) return
      setStep({ kind: 'reading' })
      const result = await readRoster(photo)
      const fresh = result.players.filter(p => !existing.includes(p.number))
      setPicked(new Set(fresh.map(p => p.number)))
      setStep({ kind: 'review', result: { ...result, players: fresh } })
    } catch (err) {
      if (!(err instanceof RosterScanError)) Sentry.captureException(err)
      setStep({ kind: 'error', message: err instanceof RosterScanError ? err.message : "Couldn't read the photo. Try again." })
    }
  }

  const chosen = step.kind === 'review' ? step.result.players.filter(p => picked.has(p.number)) : []
  const toggle = (n: number) => setPicked(prev => {
    const next = new Set(prev)
    if (next.has(n)) next.delete(n)
    else next.add(n)
    return next
  })
  const regulars = chosen.filter(p => !p.libero)

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title={`Scan ${teamLabel} roster`}>
      <SheetBody>
        {(step.kind === 'choose' || step.kind === 'error') && (
          <>
            <Text style={shared.body}>Take a photo of a roster, lineup card or team list. Printed or neat handwriting works best.</Text>
            {step.kind === 'error' && <Text style={[shared.caption, { color: theme.colors.error }]} accessibilityRole="alert">{step.message}</Text>}
            {Platform.OS !== 'web' && <Button label="Take a photo" icon="camera-outline" onPress={() => void scan('camera')} testID="scan-camera" />}
            <Button label={Platform.OS === 'web' ? 'Choose or take a photo' : 'Choose a photo'} icon="images-outline" variant={Platform.OS === 'web' ? 'primary' : 'secondary'} onPress={() => void scan('library')} testID="scan-library" />
            <Text style={shared.caption}>The photo is read by an AI model and isn't saved. Check the names before adding them.</Text>
          </>
        )}
        {step.kind === 'reading' && (
          <View style={{ alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.lg }} accessibilityLiveRegion="polite">
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={shared.body}>Reading names and numbers…</Text>
          </View>
        )}
        {step.kind === 'review' && (
          <>
            {step.result.players.length === 0 ? (
              <>
                <Text style={shared.body}>No new players found in that photo.</Text>
                <Button label="Try another photo" variant="secondary" onPress={() => setStep({ kind: 'choose' })} />
              </>
            ) : (
              <>
                <SheetLabel>Found {step.result.players.length}. Tap to leave someone out.</SheetLabel>
                <Row>
                  {step.result.players.map(p => (
                    <PlayerChip key={p.number} number={p.number} name={p.name} libero={p.libero} selected={picked.has(p.number)} onPress={() => toggle(p.number)} testID={`scan-pick-${p.number}`} />
                  ))}
                </Row>
                <Text style={shared.caption}>You can fix a name or number afterwards by tapping the player.</Text>
                {courtEmpty && regulars.length >= 6 && (
                  <Button
                    label="First six on court, rest on bench"
                    onPress={() => { onAdd(chosen, { fillCourt: true, teamName: step.result.teamName }); onDismiss() }}
                    testID="scan-fill-court"
                  />
                )}
                <Button
                  label={`Add ${chosen.length} to the bench`}
                  variant={courtEmpty && regulars.length >= 6 ? 'secondary' : 'primary'}
                  disabled={!chosen.length}
                  onPress={() => { onAdd(chosen, { fillCourt: false, teamName: step.result.teamName }); onDismiss() }}
                  testID="scan-add-bench"
                />
              </>
            )}
          </>
        )}
      </SheetBody>
    </BottomSheet>
  )
}
