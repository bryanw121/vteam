import { View } from 'react-native'
import { BottomSheet } from '../ui'
import { Button } from '../Button'
import { SheetBody } from './SheetParts'
import { theme } from '../../constants'
import { teamName } from '../../lib/scoresheet/summary'
import type { MatchDoc, ScoreEventInput, SetState } from '../../types'

type Props = { visible: boolean; onDismiss: () => void; doc: MatchDoc; set: SetState; onSubmit: (input: ScoreEventInput) => void }

/** Time-out: one tap per team, with how many each has used. */
export function TimeoutSheet({ visible, onDismiss, doc, set, onSubmit }: Props) {
  const max = doc.setup.rules.timeoutsPerSet
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Time-out">
      <SheetBody>
        <View style={{ gap: theme.spacing.sm }}>
          {(['A', 'B'] as const).map(side => {
            const used = set.teams[side].timeouts.length
            return (
              <Button
                key={side}
                label={`${teamName(doc, side)} (${used} of ${max} used)`}
                variant={used >= max ? 'secondary' : 'primary'}
                onPress={() => { onSubmit({ type: 'timeout', team: side }); onDismiss() }}
                testID={`timeout-${side}`}
              />
            )
          })}
        </View>
      </SheetBody>
    </BottomSheet>
  )
}
