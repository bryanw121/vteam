import { useEffect, useRef, useState } from 'react'
import { Switch, View } from 'react-native'
import { Text, TextInput } from '../ui/Text'
import { BottomSheet } from '../ui'
import { Button } from '../Button'
import { Input } from '../Input'
import { SheetBody } from './SheetParts'
import { PlayerChip } from './PlayerChip'
import { shared, theme } from '../../constants'
import type { RosterPlayer } from '../../types'

type Props = {
  visible: boolean
  /** Changes whenever a different spot is being edited (the form resets). */
  editKey: string
  title: string
  initial: RosterPlayer | null
  /** Jersey numbers already used by this team (other than this player). */
  taken: number[]
  /** Bench players can be liberos; court spots can't. */
  allowLibero: boolean
  /** "Save and next" label when another empty spot follows. */
  saveLabel?: string
  onSave: (player: RosterPlayer) => void
  onRemove?: () => void
  /** Bench players who can be put in this court spot with one tap. */
  bench?: RosterPlayer[]
  onPickBench?: (player: RosterPlayer) => void
  onDismiss: () => void
}

/** Add or edit one player: jersey number (required), name, captain, libero. */
export function PlayerSheet({ visible, editKey, title, initial, taken, allowLibero, saveLabel = 'Save', onSave, onRemove, bench, onPickBench, onDismiss }: Props) {
  const [num, setNum] = useState('')
  const [name, setName] = useState('')
  const [captain, setCaptain] = useState(false)
  const [libero, setLibero] = useState(false)
  const [tried, setTried] = useState(false)
  const numRef = useRef<TextInput>(null)
  const nameRef = useRef<TextInput>(null)

  useEffect(() => {
    if (!visible) return
    setNum(initial ? String(initial.number) : '')
    setName(initial?.name ?? '')
    setCaptain(!!initial?.captain)
    setLibero(!!initial?.libero)
    setTried(false)
    const t = setTimeout(() => numRef.current?.focus(), 250)
    return () => clearTimeout(t)
  }, [visible, editKey, initial])

  const n = /^\d{1,2}$/.test(num.trim()) ? Number(num.trim()) : null
  const error = n == null ? 'Enter a jersey number (0–99).' : taken.includes(n) ? `#${n} is already on this team.` : undefined

  const save = () => {
    setTried(true)
    if (error || n == null) return
    onSave({ number: n, ...(name.trim() ? { name: name.trim() } : {}), ...(captain ? { captain } : {}), ...(allowLibero && libero ? { libero } : {}) })
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title={title}>
      <SheetBody>
        {!!bench?.length && onPickBench && (
          <View style={{ gap: theme.spacing.xs }}>
            <Text style={shared.label}>From the bench</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {bench.map(p => <PlayerChip key={p.number} number={p.number} name={p.name} onPress={() => onPickBench(p)} testID={`bench-pick-${p.number}`} />)}
            </View>
            <Text style={shared.caption}>Or type a new player:</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <View style={{ width: 96 }}>
            <Input
              ref={numRef}
              label="Number"
              value={num}
              onChangeText={v => setNum(v.replace(/[^0-9]/g, '').slice(0, 2))}
              keyboardType="number-pad"
              returnKeyType="next"
              onSubmitEditing={() => nameRef.current?.focus()}
              blurOnSubmit={false}
              maxLength={2}
              error={tried ? error : undefined}
              accessibilityLabel="Jersey number"
              testID="player-number"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              ref={nameRef}
              label="Name (optional)"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={save}
              maxLength={40}
              testID="player-name"
            />
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <Switch value={captain} onValueChange={setCaptain} accessibilityLabel="Captain" />
          <Text style={[shared.body, { flex: 1 }]}>Captain</Text>
        </View>
        {allowLibero && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <Switch value={libero} onValueChange={setLibero} accessibilityLabel="Libero" testID="player-libero" />
            <Text style={[shared.body, { flex: 1 }]}>Libero</Text>
          </View>
        )}
        <Button label={saveLabel} onPress={save} testID="player-save" />
        {onRemove && <Button label="Remove player" variant="ghost" icon="trash-outline" onPress={onRemove} />}
      </SheetBody>
    </BottomSheet>
  )
}
