import { useEffect, useMemo, useState } from 'react'
import { Text } from '../ui/Text'
import { BottomSheet, Chip } from '../ui'
import { Button } from '../Button'
import { Row, SheetBody, SheetLabel } from './SheetParts'
import { shared } from '../../constants'
import { other, serverOf, servingRalliesInCurrentSet } from '../../lib/scoresheet/engine'
import { playerLabel } from '../../lib/scoresheet/describe'
import { teamName } from '../../lib/scoresheet/summary'
import type { MatchDoc, ScoreEventInput, SetState, WrongServerEvent } from '../../types'

type Props = { visible: boolean; onDismiss: () => void; doc: MatchDoc; set: SetState; onSubmit: (input: ScoreEventInput) => void }

/** Out of rotation: who should be serving, and what to do about a wrong server. */
export function WrongServerSheet({ visible, onDismiss, doc, set, onSubmit }: Props) {
  const team = set.serving
  const [when, setWhen] = useState<WrongServerEvent['when']>('before-serve')
  const [since, setSince] = useState<string | null>(null)
  useEffect(() => { if (visible) { setWhen('before-serve'); setSince(null) } }, [visible])
  const rallies = useMemo(() => (visible ? servingRalliesInCurrentSet(doc.setup, doc.log, team) : []), [visible, doc, team])
  const expected = playerLabel(doc.setup, team, serverOf(set.teams[team]))
  const options: { key: WrongServerEvent['when']; label: string; body: string }[] = [
    { key: 'before-serve', label: 'Caught before the serve', body: 'They swap to the right server. No penalty; a note goes in Remarks.' },
    { key: 'after-serve', label: 'Just served', body: `The rally goes to ${teamName(doc, other(team))}.` },
    { key: 'discovered-later', label: 'Found out later', body: `Points ${teamName(doc, team)} scored with the wrong server are cancelled, then ${teamName(doc, other(team))} gets the point and serve.` },
  ]
  const chosen = options.find(o => o.key === when)
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Wrong server">
      <SheetBody>
        <Text style={shared.body}>{teamName(doc, team)} should be serving with <Text style={{ fontWeight: '700' }}>{expected}</Text>.</Text>
        <Row>{options.map(o => <Chip key={o.key} label={o.label} role="radio" active={when === o.key} onPress={() => setWhen(o.key)} testID={`wrong-${o.key}`} />)}</Row>
        <Text style={shared.caption}>{chosen?.body}</Text>
        {when === 'discovered-later' && (
          <>
            <SheetLabel>First point the wrong player served (score after it)</SheetLabel>
            <Row>
              {rallies.map(r => <Chip key={r.eventId} label={r.score} role="radio" variant="tint" active={since === r.eventId} onPress={() => setSince(r.eventId)} />)}
              {!rallies.length && <Text style={shared.caption}>{teamName(doc, team)} hasn't scored on serve this set, so there's nothing to cancel.</Text>}
            </Row>
          </>
        )}
        <Button
          label="Record"
          disabled={when === 'discovered-later' && rallies.length > 0 && since == null}
          onPress={() => {
            // Found later with nothing scored on serve: the fault alone.
            const kind = when === 'discovered-later' && !rallies.length ? 'after-serve' : when
            onSubmit({ type: 'wrong_server', team, when: kind, ...(kind === 'discovered-later' && since ? { sinceEventId: since } : {}) })
            onDismiss()
          }}
          testID="wrong-confirm"
        />
      </SheetBody>
    </BottomSheet>
  )
}
