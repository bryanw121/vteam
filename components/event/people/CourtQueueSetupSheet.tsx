import React, { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Text } from '../../ui/Text'
import { BottomSheet, Chip } from '../../ui'
import { Button } from '../../Button'
import { shared } from '../../../constants'
import { COURT_QUEUE_COPY } from '../../../constants/copy'
import { COURT_QUEUE_MAX_COURTS, usableCourts } from '../../../utils/courtQueue'
import type { CourtQueueRule } from '../../../types'
import type { CourtQueueSetupSheetProps } from '../../../types/people'

const STAY_OPTIONS = [1, 2, 3, 4, 5]

function sameRule(a: CourtQueueRule, b: CourtQueueRule): boolean {
  return a.kind === b.kind && (a.kind === 'both_off' || (b.kind === 'stay' && a.stayMax === b.stayMax))
}

/** How many courts, and what happens after a game (#333). */
export function CourtQueueSetupSheet({ visible, onDismiss, teamCount, courts, rule, onSave, saveLabel }: CourtQueueSetupSheetProps) {
  const [n, setN] = useState(courts)
  const [r, setR] = useState<CourtQueueRule>(rule)
  useEffect(() => { if (visible) { setN(courts); setR(rule) } }, [visible, courts, rule])
  const maxCourts = usableCourts(teamCount, COURT_QUEUE_MAX_COURTS)
  const ruleOptions: { label: string; value: CourtQueueRule }[] = [
    ...STAY_OPTIONS.map(m => ({ label: COURT_QUEUE_COPY.stayOption(m), value: { kind: 'stay' as const, stayMax: m } })),
    { label: COURT_QUEUE_COPY.stayAlways, value: { kind: 'stay', stayMax: null } },
    { label: COURT_QUEUE_COPY.bothOff, value: { kind: 'both_off' } },
  ]
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title={COURT_QUEUE_COPY.setupTitle}>
      <View style={shared.courtSheetBody}>
        <Text style={shared.subheading}>{COURT_QUEUE_COPY.courtsLabel}</Text>
        <View role="radiogroup" aria-label={COURT_QUEUE_COPY.courtsLabel} style={shared.courtSheetOptions}>
          {Array.from({ length: maxCourts }, (_, i) => i + 1).map(c => (
            <Chip key={c} role="radio" label={String(c)} active={n === c} onPress={() => setN(c)} testID={`court-queue-courts-${c}`} />
          ))}
        </View>
        <Text style={shared.subheading}>{COURT_QUEUE_COPY.ruleHeading}</Text>
        <View role="radiogroup" aria-label={COURT_QUEUE_COPY.ruleHeading} style={shared.courtSheetOptions}>
          {ruleOptions.map(o => (
            <Chip key={o.label} role="radio" label={o.label} active={sameRule(o.value, r)} onPress={() => setR(o.value)} />
          ))}
        </View>
        <Button label={saveLabel} onPress={() => onSave(Math.min(n, maxCourts), r)} testID="court-queue-save" />
      </View>
    </BottomSheet>
  )
}
