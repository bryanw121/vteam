import { useEffect, useState } from 'react'
import { Text } from '../ui/Text'
import { BottomSheet, Chip } from '../ui'
import { Button } from '../Button'
import { PlayerChip } from './PlayerChip'
import { Row, SheetBody, SheetLabel, TeamPicker } from './SheetParts'
import { shared } from '../../constants'
import { SANCTION_LABELS, STAFF_LABELS } from '../../lib/scoresheet/describe'
import { other } from '../../lib/scoresheet/engine'
import { teamName } from '../../lib/scoresheet/summary'
import type { MatchDoc, SanctionKind, ScoreEventInput, StaffRole, TeamSide } from '../../types'

type Props = { visible: boolean; onDismiss: () => void; doc: MatchDoc; initialTeam: TeamSide; onSubmit: (input: ScoreEventInput) => void }

const KINDS: SanctionKind[] = ['delay-warning', 'delay-penalty', 'warning', 'penalty', 'expulsion', 'disqualification', 'improper-request']
const TEAM_ONLY: SanctionKind[] = ['delay-warning', 'delay-penalty', 'improper-request']

/** Cards, delays and improper requests. Penalties give the other team a point and the serve. */
export function SanctionSheet({ visible, onDismiss, doc, initialTeam, onSubmit }: Props) {
  const [team, setTeam] = useState<TeamSide>(initialTeam)
  const [kind, setKind] = useState<SanctionKind>('warning')
  const [who, setWho] = useState<number | StaffRole | undefined>(undefined)
  useEffect(() => {
    if (visible) { setTeam(initialTeam); setKind('warning'); setWho(undefined) }
  }, [visible, initialTeam])
  const teamOnly = TEAM_ONLY.includes(kind)
  const awardsPoint = kind === 'penalty' || kind === 'delay-penalty'
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Sanction">
      <SheetBody>
        <TeamPicker doc={doc} value={team} onChange={v => { setTeam(v); setWho(undefined) }} />
        <SheetLabel>What</SheetLabel>
        <Row>{KINDS.map(k => <Chip key={k} label={SANCTION_LABELS[k]} role="radio" variant="tint" active={kind === k} onPress={() => setKind(k)} testID={`sanction-${k}`} />)}</Row>
        {!teamOnly && (
          <>
            <SheetLabel>Who</SheetLabel>
            <Row>
              {doc.setup.teams[team].players.map(p => <PlayerChip key={p.number} number={p.number} name={p.name} libero={p.libero} selected={who === p.number} onPress={() => setWho(p.number)} />)}
            </Row>
            <Row>{(Object.keys(STAFF_LABELS) as StaffRole[]).map(r => <Chip key={r} label={STAFF_LABELS[r]} variant="tint" active={who === r} onPress={() => setWho(r)} />)}</Row>
          </>
        )}
        {awardsPoint && <Text style={shared.caption}>{teamName(doc, other(team))} gets a point and the serve.</Text>}
        {kind === 'improper-request' && <Text style={shared.caption}>A second improper request in the match is a delay: record it as a delay warning.</Text>}
        <Button
          label="Record sanction"
          disabled={!teamOnly && who == null}
          onPress={() => { onSubmit({ type: 'sanction', team, kind, ...(teamOnly || who == null ? {} : { who }) }); onDismiss() }}
          testID="sanction-confirm"
        />
      </SheetBody>
    </BottomSheet>
  )
}
