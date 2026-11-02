import { useEffect, useState } from 'react'
import { Text } from '../ui/Text'
import { BottomSheet } from '../ui'
import { Button } from '../Button'
import { Input } from '../Input'
import { Row, SheetBody, SheetLabel, TeamPicker } from './SheetParts'
import { shared } from '../../constants'
import type { MatchDoc, ScoreEventInput, TeamSide } from '../../types'

type Props = { visible: boolean; onDismiss: () => void; doc: MatchDoc; mode: 'note' | 'end_set'; onSubmit: (input: ScoreEventInput) => void }

/** A note for Remarks, or ending the set early (forfeit, default, time limit) with a reason. */
export function TextSheet({ visible, onDismiss, doc, mode, onSubmit }: Props) {
  const [text, setText] = useState('')
  const [winner, setWinner] = useState<TeamSide>('A')
  useEffect(() => { if (visible) setText('') }, [visible])
  const isEnd = mode === 'end_set'
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title={isEnd ? 'End set early' : 'Add a remark'}>
      <SheetBody>
        {isEnd && (
          <>
            <Text style={shared.caption}>For a forfeit, a team that can't field six players, or a time limit. The set goes to the team you pick.</Text>
            <SheetLabel>Set goes to</SheetLabel>
            <Row><TeamPicker doc={doc} value={winner} onChange={setWinner} /></Row>
          </>
        )}
        <Input
          label={isEnd ? 'Reason' : 'Remark'}
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={3}
          maxLength={240}
          placeholder={isEnd ? 'Team B could not field six players' : 'Protest by Team A captain at 18–17'}
          testID="text-sheet-input"
        />
        <Button
          label={isEnd ? 'End the set' : 'Add remark'}
          variant={isEnd ? 'danger' : 'primary'}
          disabled={!text.trim()}
          onPress={() => {
            onSubmit(isEnd ? { type: 'end_set', winner, reason: text.trim() } : { type: 'note', text: text.trim() })
            onDismiss()
          }}
          testID="text-sheet-confirm"
        />
      </SheetBody>
    </BottomSheet>
  )
}
