import { useEffect, useState } from 'react'
import { Switch, View } from 'react-native'
import { Text } from '../ui/Text'
import { BottomSheet } from '../ui'
import { Button } from '../Button'
import { Input } from '../Input'
import { PlayerChip } from './PlayerChip'
import { Row, SheetBody, SheetLabel, TeamPicker } from './SheetParts'
import { shared, theme } from '../../constants'
import { courtOf } from '../../lib/scoresheet/engine'
import type { MatchDoc, ScoreEventInput, SetState, TeamSide } from '../../types'

type Props = {
  visible: boolean
  onDismiss: () => void
  doc: MatchDoc
  set: SetState
  initialTeam: TeamSide
  initialOut?: number
  onSubmit: (input: ScoreEventInput) => void
}

/** Substitution: who leaves, who comes in (bench or any number), exceptional for injuries. */
export function SubSheet({ visible, onDismiss, doc, set, initialTeam, initialOut, onSubmit }: Props) {
  const [team, setTeam] = useState<TeamSide>(initialTeam)
  const [out, setOut] = useState<number | null>(initialOut ?? null)
  const [inn, setIn] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  const [exceptional, setExceptional] = useState(false)

  useEffect(() => {
    if (!visible) return
    setTeam(initialTeam)
    setOut(initialOut ?? null)
    setIn(null)
    setTyped('')
    setExceptional(false)
  }, [visible, initialTeam, initialOut])

  const t = set.teams[team]
  const rules = doc.setup.rules
  const court = courtOf(t).filter(c => !c.libero)
  const roster = doc.setup.teams[team].players
  const bench = roster.filter(p => !t.slots.includes(p.number) && !t.liberos.includes(p.number) && !p.libero)
  const used = t.subs.filter(s => !s.exceptional).length
  const typedNum = /^\d{1,2}$/.test(typed.trim()) ? Number(typed.trim()) : null
  const incoming = inn ?? typedNum
  const names = new Map(roster.map(p => [p.number, p.name ?? '']))

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Substitution">
      <SheetBody>
        <TeamPicker doc={doc} value={team} onChange={v => { setTeam(v); setOut(null); setIn(null) }} testID="sub-team" />
        <Text style={shared.caption}>
          {rules.subsPerSet != null ? `${used} of ${rules.subsPerSet} used this set.` : `${used} used this set.`}
          {rules.reentry === 'same-position' ? ' A player who has played can only come back in the same spot.' : ''}
          {rules.reentry === 'starter-once' ? ' A starter can come back once, for the player who replaced them.' : ''}
        </Text>
        <SheetLabel>Leaving the court</SheetLabel>
        <Row>
          {court.map(c => <PlayerChip key={c.player} number={c.player} name={names.get(c.player)} selected={out === c.player} onPress={() => setOut(c.player)} testID={`sub-out-${c.player}`} />)}
        </Row>
        <SheetLabel>Coming in</SheetLabel>
        <Row>
          {bench.map(p => <PlayerChip key={p.number} number={p.number} name={p.name} selected={inn === p.number} onPress={() => { setIn(p.number); setTyped('') }} testID={`sub-in-${p.number}`} />)}
          {!bench.length && <Text style={shared.caption}>Everyone on the roster is on the court.</Text>}
        </Row>
        <Input label="Or type a number" value={typed} onChangeText={v => { setTyped(v); setIn(null) }} keyboardType="number-pad" maxLength={2} placeholder="e.g. 21" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <Switch value={exceptional} onValueChange={setExceptional} accessibilityLabel="Exceptional substitution (injury)" />
          <Text style={[shared.body, { flex: 1 }]}>Exceptional (injured or ill player). Goes in Remarks; doesn't count against the limits.</Text>
        </View>
        <Button
          label={out != null && incoming != null ? `#${incoming} in for #${out}` : 'Pick both players'}
          disabled={out == null || incoming == null}
          onPress={() => {
            if (out == null || incoming == null) return
            onSubmit({ type: 'sub', team, out, in: incoming, ...(exceptional ? { exceptional } : {}) })
            onDismiss()
          }}
          testID="sub-confirm"
        />
      </SheetBody>
    </BottomSheet>
  )
}
