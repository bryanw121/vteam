import React, { useState } from 'react'
import { View } from 'react-native'
import type { StyleProp, TextStyle, ViewStyle } from 'react-native'
import { Text, TextInput } from '../ui/Text'
import { Chip, IconButton } from '../ui'
import { Button } from '../Button'
import { shared, theme } from '../../constants'
import { BRING_COPY, BRING_LIMITS } from '../../constants/bringItems'
import { bringSuggestions, clampBringQuantity, newBringDraft } from '../../utils/bringList'
import type { BringItemDraft, Surface } from '../../types'

type Props = {
  drafts: BringItemDraft[]
  onChange: (next: BringItemDraft[]) => void
  surface: Surface | null
  /** The host form's card and label styles, so the section matches its neighbours. */
  cardStyle: StyleProp<ViewStyle>
  labelStyle: StyleProp<TextStyle>
}

/**
 * Host form: "What to bring" (#256). Suggestion chips by court surface, a
 * free-text item, and per item a quantity, "Needed for the game" and "I'm
 * bringing it". Saved by the host screen after the event row.
 */
export function BringItemsSection({ drafts, onChange, surface, cardStyle, labelStyle }: Props) {
  const [text, setText] = useState('')
  const full = drafts.length >= BRING_LIMITS.items
  const suggestions = full ? [] : bringSuggestions(surface, drafts)

  const add = (label: string) => {
    const d = newBringDraft(label, drafts)
    if (d) onChange([...drafts, d])
  }
  const update = (i: number, patch: Partial<BringItemDraft>) =>
    onChange(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  const remove = (i: number) => onChange(drafts.filter((_, j) => j !== i))
  const submitText = () => {
    if (!text.trim()) return
    add(text)
    setText('')
  }

  return (
    <View style={cardStyle} testID="host-bring-section">
      <Text style={labelStyle}>{BRING_COPY.title}</Text>
      <Text style={shared.caption}>{BRING_COPY.hostHint}</Text>
      {suggestions.length > 0 && (
        <View style={shared.chipRowWrap}>
          {suggestions.map(s => (
            <Chip key={s} label={`+ ${s}`} onPress={() => add(s)} variant="tint" testID={`host-bring-suggest-${s}`} />
          ))}
        </View>
      )}
      {drafts.map((d, i) => (
        <View key={d.id ?? d.label} style={{ borderTopWidth: 1, borderTopColor: theme.colors.borderSoft, paddingVertical: theme.spacing.xs }} testID="host-bring-item">
          <View style={shared.bringDraftRow}>
            <Text style={[shared.bringLabel, { flex: 1, minWidth: 0 }]} numberOfLines={2}>{d.label}</Text>
            <View style={shared.bringStepper}>
              <IconButton icon="remove" size={44} label={`Fewer ${d.label}`} onPress={() => update(i, { quantity: clampBringQuantity(d.quantity - 1) })} />
              <Text style={shared.bringStepperValue} accessibilityLabel={`Quantity ${d.quantity}`}>{d.quantity}</Text>
              <IconButton icon="add" size={44} label={`More ${d.label}`} onPress={() => update(i, { quantity: clampBringQuantity(d.quantity + 1) })} />
            </View>
            <IconButton icon="close" size={44} label={`Remove ${d.label}`} onPress={() => remove(i)} testID="host-bring-remove" />
          </View>
          <View style={shared.bringToggleRow}>
            <Chip label={BRING_COPY.required} active={d.required} variant="tint" onPress={() => update(i, { required: !d.required })} testID="host-bring-required" />
            <Chip label={BRING_COPY.mine} active={d.mine} variant="tint" onPress={() => update(i, { mine: !d.mine })} testID="host-bring-mine" />
          </View>
        </View>
      ))}
      {!full && (
        <View style={shared.bringAddRow}>
          <TextInput
            value={text}
            onChangeText={v => setText(v.slice(0, BRING_LIMITS.label))}
            onSubmitEditing={submitText}
            placeholder={BRING_COPY.addPlaceholder}
            placeholderTextColor={theme.colors.subtext}
            accessibilityLabel="Add an item to bring"
            returnKeyType="done"
            maxLength={BRING_LIMITS.label}
            style={[shared.input, { flex: 1, fontSize: theme.font.size.base, marginBottom: 0 }]}
            testID="host-bring-input"
          />
          <Button label="Add" size="touch" variant="secondary" fullWidth={false} onPress={submitText} disabled={!text.trim()} testID="host-bring-add" />
        </View>
      )}
      <Text style={[shared.caption, { marginTop: theme.spacing.xs }]}>
        {full ? `That's the most a game can list (${BRING_LIMITS.items}).` : `Up to ${BRING_LIMITS.items} items.`}
      </Text>
    </View>
  )
}
