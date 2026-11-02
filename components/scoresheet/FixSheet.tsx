import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Text } from '../ui/Text'
import { BottomSheet, Chip, IconButton } from '../ui'
import { Button } from '../Button'
import { Input } from '../Input'
import { Row, SheetBody, SheetLabel } from './SheetParts'
import { shared, theme } from '../../constants'
import { POSITION_LABELS } from '../../lib/scoresheet/engine'
import { teamName } from '../../lib/scoresheet/summary'
import type { MatchDoc, ScoreEventInput, SetState, TeamSide } from '../../types'

type Props = { visible: boolean; onDismiss: () => void; doc: MatchDoc; set: SetState; onSubmit: (input: ScoreEventInput) => void }

/**
 * Last resort when the app and the court disagree: set the score, who serves and who is in
 * position I, with a reason for Remarks. Prefer the timeline (fix the one wrong rally) when you
 * know what went wrong, because it keeps the service rounds right.
 */
export function FixSheet({ visible, onDismiss, doc, set, onSubmit }: Props) {
  const [score, setScore] = useState({ A: 0, B: 0 })
  const [serving, setServing] = useState<TeamSide>('A')
  const [rotation, setRotation] = useState({ A: 0, B: 0 })
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (!visible) return
    setScore({ A: set.teams.A.score, B: set.teams.B.score })
    setServing(set.serving)
    setRotation({ A: set.teams.A.rotation, B: set.teams.B.rotation })
    setReason('')
  }, [visible, set])

  const step = (side: TeamSide, d: number) => setScore(prev => ({ ...prev, [side]: Math.max(0, prev[side] + d) }))
  const changed = score.A !== set.teams.A.score || score.B !== set.teams.B.score || serving !== set.serving || rotation.A !== set.teams.A.rotation || rotation.B !== set.teams.B.rotation

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Match the scoreboard">
      <SheetBody>
        <Text style={shared.caption}>Use this when the app and the official scoreboard disagree and you can't find the rally that went wrong. The change and your reason go in Remarks.</Text>
        {(['A', 'B'] as const).map(side => (
          <View key={side} style={[shared.card, { gap: theme.spacing.sm }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <Text style={[shared.subheading, { flex: 1 }]} numberOfLines={1}>{teamName(doc, side)}</Text>
              <IconButton icon="remove" size={44} label={`One point less for ${teamName(doc, side)}`} onPress={() => step(side, -1)} />
              <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.heading.lg, color: theme.colors.text, minWidth: 40, textAlign: 'center' }}>{score[side]}</Text>
              <IconButton icon="add" size={44} label={`One point more for ${teamName(doc, side)}`} onPress={() => step(side, 1)} />
            </View>
            <SheetLabel>In position I (serves next for this team)</SheetLabel>
            <Row>
              {set.teams[side].slots.map((player, slot) => (
                <Chip key={slot} label={`#${player} (${POSITION_LABELS[slot]})`} role="radio" variant="tint" active={rotation[side] === slot} onPress={() => setRotation(prev => ({ ...prev, [side]: slot }))} />
              ))}
            </Row>
          </View>
        ))}
        <SheetLabel>Serving now</SheetLabel>
        <Row>{(['A', 'B'] as const).map(side => <Chip key={side} label={teamName(doc, side)} role="radio" active={serving === side} onPress={() => setServing(side)} />)}</Row>
        <Input label="Reason (goes on the scoresheet)" value={reason} onChangeText={setReason} placeholder="Scoreboard showed 14–12 after the time-out" maxLength={160} testID="fix-reason" />
        <Button
          label="Apply correction"
          disabled={!changed || !reason.trim()}
          onPress={() => {
            onSubmit({ type: 'override', reason: reason.trim(), score, serving, rotation })
            onDismiss()
          }}
          testID="fix-confirm"
        />
      </SheetBody>
    </BottomSheet>
  )
}
