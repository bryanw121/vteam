import { useEffect, useMemo, useState } from 'react'
import { Text } from '../ui/Text'
import { BottomSheet, Chip } from '../ui'
import { Button } from '../Button'
import { Row, SheetBody, SheetLabel, TeamPicker } from './SheetParts'
import { shared } from '../../constants'
import { other, serverOf, servingRalliesInCurrentSet } from '../../lib/scoresheet/engine'
import { playerLabel } from '../../lib/scoresheet/describe'
import { teamName } from '../../lib/scoresheet/summary'
import type { MatchDoc, ScoreEventInput, SetState, TeamSide } from '../../types'

type Props = { visible: boolean; onDismiss: () => void; doc: MatchDoc; set: SetState; onSubmit: (input: ScoreEventInput) => void }

type Fault = 'positional' | 'before-serve' | 'after-serve' | 'discovered-later'

/**
 * Out of rotation, by either team: a positional fault at the serve (the other team gets the
 * point), or, for the serving team, the wrong player serving (caught before the serve, just
 * served, or found out later with the points cancelled).
 */
export function WrongServerSheet({ visible, onDismiss, doc, set, onSubmit }: Props) {
  const [team, setTeam] = useState<TeamSide>(set.serving)
  const [fault, setFault] = useState<Fault>('positional')
  const [since, setSince] = useState<string | null>(null)
  useEffect(() => {
    if (!visible) return
    setTeam(set.serving)
    setFault('positional')
    setSince(null)
  }, [visible, set.serving])

  const serving = team === set.serving
  const rallies = useMemo(() => (visible && serving ? servingRalliesInCurrentSet(doc.setup, doc.log, team) : []), [visible, serving, doc, team])
  const expected = playerLabel(doc.setup, set.serving, serverOf(set.teams[set.serving]))
  const opp = teamName(doc, other(team))
  const options: { key: Fault; label: string; body: string }[] = [
    {
      key: 'positional',
      label: 'Out of position at the serve',
      body: serving
        ? `Overlap or wrong order when the ball was served: ${opp} gets the point and the serve.`
        : `Overlap or wrong order when the ball was served: ${opp} gets the point and keeps serving.`,
    },
    ...(serving
      ? ([
          { key: 'before-serve', label: 'Wrong server, caught before the serve', body: 'They swap to the right server. No penalty; a note goes in Remarks.' },
          { key: 'after-serve', label: 'Wrong server, just served', body: `The rally goes to ${opp}.` },
          { key: 'discovered-later', label: 'Wrong server, found out later', body: `Points ${teamName(doc, team)} scored with the wrong server are cancelled, then ${opp} gets the point and the serve.` },
        ] as const)
      : []),
  ]
  const chosen = options.find(o => o.key === fault) ?? options[0]

  const submit = () => {
    if (chosen.key === 'positional') onSubmit({ type: 'rotation_fault', team })
    else {
      // Found later with nothing scored on serve: the fault alone.
      const when = chosen.key === 'discovered-later' && !rallies.length ? 'after-serve' : chosen.key
      onSubmit({ type: 'wrong_server', team, when, ...(when === 'discovered-later' && since ? { sinceEventId: since } : {}) })
    }
    onDismiss()
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Out of rotation">
      <SheetBody>
        <Text style={shared.body}>
          {teamName(doc, set.serving)} should be serving with <Text style={{ fontWeight: '700' }}>{expected}</Text>.
        </Text>
        <SheetLabel>Team at fault</SheetLabel>
        <TeamPicker doc={doc} value={team} onChange={v => { setTeam(v); setFault('positional'); setSince(null) }} testID="fault-team" />
        <Row>{options.map(o => <Chip key={o.key} label={o.label} role="radio" active={chosen.key === o.key} onPress={() => setFault(o.key)} testID={`wrong-${o.key}`} />)}</Row>
        <Text style={shared.caption}>{chosen.body}</Text>
        {chosen.key === 'discovered-later' && (
          <>
            <SheetLabel>First point the wrong player served (score after it)</SheetLabel>
            <Row>
              {rallies.map(r => <Chip key={r.eventId} label={r.score} role="radio" variant="tint" active={since === r.eventId} onPress={() => setSince(r.eventId)} />)}
              {!rallies.length && <Text style={shared.caption}>{teamName(doc, team)} hasn't scored on serve this set, so there's nothing to cancel.</Text>}
            </Row>
          </>
        )}
        <Button
          label={chosen.key === 'before-serve' ? 'Record note' : `Point to ${opp}`}
          disabled={chosen.key === 'discovered-later' && rallies.length > 0 && since == null}
          onPress={submit}
          testID="wrong-confirm"
        />
      </SheetBody>
    </BottomSheet>
  )
}
