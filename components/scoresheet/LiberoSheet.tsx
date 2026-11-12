import { useEffect, useState } from 'react'
import { Text } from '../ui/Text'
import { BottomSheet } from '../ui'
import { Button } from '../Button'
import { PlayerChip } from './PlayerChip'
import { Row, SheetBody, SheetLabel, TeamPicker } from './SheetParts'
import { shared } from '../../constants'
import { POSITION_LABELS, courtOf, isFrontRow } from '../../lib/scoresheet/engine'
import type { MatchDoc, ScoreEventInput, SetState, TeamSide } from '../../types'

type Props = {
  visible: boolean
  onDismiss: () => void
  doc: MatchDoc
  set: SetState
  initialTeam: TeamSide
  onSubmit: (input: ScoreEventInput) => void
}

/** Libero replacements: in for a back-row player, out again, or one libero for the other. */
export function LiberoSheet({ visible, onDismiss, doc, set, initialTeam, onSubmit }: Props) {
  const [team, setTeam] = useState<TeamSide>(initialTeam)
  const [libero, setLibero] = useState<number | null>(null)
  const [replaces, setReplaces] = useState<number | null>(null)
  useEffect(() => {
    if (!visible) return
    setTeam(initialTeam)
    setReplaces(null)
    setLibero(set.teams[initialTeam].liberos[0] ?? null)
  }, [visible, initialTeam, set])

  const t = set.teams[team]
  const names = new Map(doc.setup.teams[team].players.map(p => [p.number, p.name ?? '']))
  const backRow = courtOf(t).filter(c => !isFrontRow(c.position) && !c.libero)
  const onCourt = t.libero
  const done = (input: ScoreEventInput) => { onSubmit(input); onDismiss() }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Libero">
      <SheetBody>
        <TeamPicker doc={doc} value={team} onChange={v => { setTeam(v); setReplaces(null); setLibero(set.teams[v].liberos[0] ?? null) }} />
        {!t.liberos.length && <Text style={shared.caption}>No libero listed for this team this set.</Text>}
        {onCourt && (
          <>
            <Text style={shared.body}>Libero #{onCourt.libero} is on for #{onCourt.replaces}.</Text>
            <Button label={`#${onCourt.replaces} back in, libero out`} variant="secondary" onPress={() => done({ type: 'libero_out', team, libero: onCourt.libero })} testID="libero-out" />
            {t.liberos.filter(n => n !== onCourt.libero).map(n => (
              <Button key={n} label={`Switch to libero #${n}`} variant="ghost" onPress={() => done({ type: 'libero_in', team, libero: n, replaces: onCourt.libero })} />
            ))}
          </>
        )}
        {!onCourt && t.liberos.length > 0 && (
          <>
            {t.liberos.length > 1 && (
              <>
                <SheetLabel>Libero</SheetLabel>
                <Row>{t.liberos.map(n => <PlayerChip key={n} number={n} name={names.get(n)} libero selected={libero === n} onPress={() => setLibero(n)} />)}</Row>
              </>
            )}
            <SheetLabel>Replaces (back row)</SheetLabel>
            <Row>
              {backRow.map(c => (
                <PlayerChip key={c.player} number={c.player} name={`${POSITION_LABELS[c.position]} ${names.get(c.player) ?? ''}`.trim()} selected={replaces === c.player} onPress={() => setReplaces(c.player)} testID={`libero-for-${c.player}`} />
              ))}
            </Row>
            <Button
              label={libero != null && replaces != null ? `Libero #${libero} in for #${replaces}` : 'Pick who the libero replaces'}
              disabled={libero == null || replaces == null}
              onPress={() => libero != null && replaces != null && done({ type: 'libero_in', team, libero, replaces })}
              testID="libero-in"
            />
          </>
        )}
      </SheetBody>
    </BottomSheet>
  )
}
