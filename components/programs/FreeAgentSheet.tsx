import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Text } from '../ui/Text'
import { BottomSheet, Chip } from '../ui'
import { Button } from '../Button'
import { Input } from '../Input'
import { shared, theme } from '../../constants'
import { FREE_AGENT_NOTE_MAX, FREE_AGENT_POSITIONS, FREE_AGENT_WANTS } from '../../utils/freeAgents'
import type { FreeAgentDraft, FreeAgentSheetProps } from '../../types'

/** Put yourself on a program's Find a team list, or change / remove your entry (#304). */
export function FreeAgentSheet({ visible, programTitle, initial, editing, saving, onSave, onRemove, onDismiss }: FreeAgentSheetProps) {
  const [draft, setDraft] = useState<FreeAgentDraft>(initial)
  useEffect(() => { if (visible) setDraft(initial) }, [visible, initial])
  const togglePos = (key: FreeAgentDraft['positions'][number]) =>
    setDraft(d => ({ ...d, positions: d.positions.includes(key) ? d.positions.filter(p => p !== key) : [...d.positions, key] }))

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Find a team">
      <View style={{ gap: theme.spacing.md }}>
        <Text style={shared.caption} numberOfLines={2}>{programTitle}</Text>
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={shared.label}>I'm looking for</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {FREE_AGENT_WANTS.map(w => (
              <Chip key={w.key} label={w.label} role="radio" active={draft.want === w.key} onPress={() => setDraft(d => ({ ...d, want: w.key }))} testID={`free-agent-want-${w.key}`} />
            ))}
          </View>
        </View>
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={shared.label}>I play</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {FREE_AGENT_POSITIONS.map(p => (
              <Chip key={p.key} label={p.label} active={draft.positions.includes(p.key)} onPress={() => togglePos(p.key)} testID={`free-agent-pos-${p.key}`} />
            ))}
          </View>
        </View>
        <Input
          label="Note (optional)"
          value={draft.note}
          onChangeText={note => setDraft(d => ({ ...d, note }))}
          placeholder="Free both days, can play up a level…"
          multiline
          numberOfLines={3}
          maxLength={FREE_AGENT_NOTE_MAX}
          testID="free-agent-note"
        />
        <Text style={shared.caption}>Signed-in players see your name, level, positions and note until the tournament ends. Remove it any time.</Text>
        <Button label={editing ? 'Save' : 'Put me on the list'} onPress={() => onSave(draft)} loading={saving} testID="free-agent-save" />
        {editing && <Button label="Take me off the list" variant="ghost" icon="trash-outline" onPress={onRemove} testID="free-agent-remove" />}
      </View>
    </BottomSheet>
  )
}
