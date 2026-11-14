import { useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { Text, TextInput } from '../ui/Text'
import { BottomSheet } from '../ui'
import { Button } from '../Button'
import { Input } from '../Input'
import { SheetBody, SheetLabel } from './SheetParts'
import { POSITION_LABELS } from '../../lib/scoresheet/engine'
import { parseRosterText } from '../../lib/scoresheet/rosterText'
import { shared, theme } from '../../constants'
import type { RosterPlayer, RosterTextSheetProps } from '../../types'

/** A read-only player in the preview: number, L for a libero, first name. */
function PreviewPlayer({ number, name, libero }: RosterPlayer) {
  return (
    <View style={shared.rosterTextChip} accessibilityLabel={`${libero ? 'Libero ' : ''}#${number}${name ? ` ${name}` : ''}`}>
      <Text style={shared.rosterTextChipNumber} maxFontSizeMultiplier={1.3}>{number}{libero ? ' L' : ''}</Text>
      {!!name && <Text style={shared.caption} numberOfLines={1} maxFontSizeMultiplier={1.3}>{name.split(' ')[0]}</Text>}
    </View>
  )
}

const EXAMPLE = '1 4 7 9 12 15\n3 Maya\n5 Lee L'

/**
 * Type or paste a whole team at once: numbers on one line ("1 4 7 9 12 15") or one
 * player per line with a name, "L" for a libero and "C" for the captain. The first
 * six non-liberos start on the court in serving order (position I first); the rest
 * go to the bench. A live preview shows where everyone lands before it's applied.
 */
export function RosterTextSheet({ visible, teamLabel, initialName, initialText, onApply, onDismiss }: RosterTextSheetProps) {
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const textRef = useRef<TextInput>(null)

  useEffect(() => {
    if (!visible) return
    setName(initialName)
    setText(initialText)
    const t = setTimeout(() => textRef.current?.focus(), 250)
    return () => clearTimeout(t)
  }, [visible, initialName, initialText])

  const parsed = useMemo(() => parseRosterText(text), [text])
  const count = parsed.players.length
  const shortBy = 6 - parsed.court.length

  const apply = () => {
    const court = [...parsed.court, ...Array(Math.max(0, shortBy)).fill(null)]
    onApply({ name: name.trim(), court, bench: parsed.bench })
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title={`${teamLabel}: whole team`}>
      <SheetBody>
        <Input label="Team name (optional)" value={name} onChangeText={setName} autoCapitalize="words" autoCorrect={false} maxLength={40} testID="roster-text-name" />
        <View style={{ gap: theme.spacing.xs }}>
          <SheetLabel>Players</SheetLabel>
          <TextInput
            ref={textRef}
            value={text}
            onChangeText={setText}
            multiline
            autoCapitalize="words"
            autoCorrect={false}
            placeholder={EXAMPLE}
            placeholderTextColor={theme.colors.subtext}
            style={[shared.input, shared.rosterTextInput]}
            accessibilityLabel={`${teamLabel} players: jersey numbers, one line or one player per line`}
            testID="roster-text-input"
          />
          <Text style={shared.caption}>
            Numbers on one line, or one player per line with a name. Add L for a libero, C for the captain. The first six (not liberos) start in serving order, I to VI.
          </Text>
        </View>

        {count > 0 && (
          <View style={{ gap: theme.spacing.sm }} testID="roster-text-preview">
            <SheetLabel>Starting six</SheetLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {POSITION_LABELS.map((label, i) => {
                const p = parsed.court[i]
                return (
                  <View key={label} style={shared.rosterTextSlot}>
                    <Text style={shared.rosterTextSlotLabel}>{label}</Text>
                    {p ? <PreviewPlayer number={p.number} name={p.name} /> : <Text style={shared.caption}>empty</Text>}
                  </View>
                )
              })}
            </View>
            {parsed.bench.length > 0 && (
              <>
                <SheetLabel>Bench</SheetLabel>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {parsed.bench.map(p => <PreviewPlayer key={p.number} number={p.number} name={p.name} libero={p.libero} />)}
                </View>
              </>
            )}
          </View>
        )}

        {parsed.issues.length > 0 && (
          <View style={{ gap: theme.spacing.xxs }} accessibilityLiveRegion="polite" testID="roster-text-issues">
            {parsed.issues.slice(0, 4).map(issue => (
              <Text key={`${issue.line}:${issue.text}`} style={shared.errorText}>Line {issue.line} ("{issue.text}"): {issue.message}</Text>
            ))}
            {parsed.issues.length > 4 && <Text style={shared.errorText}>And {parsed.issues.length - 4} more.</Text>}
          </View>
        )}

        <Button
          label={count === 0 ? 'Add players' : shortBy > 0 ? `Use ${count} player${count === 1 ? '' : 's'} (${shortBy} spot${shortBy === 1 ? '' : 's'} still empty)` : `Use these ${count} players`}
          onPress={apply}
          disabled={count === 0}
          testID="roster-text-apply"
        />
      </SheetBody>
    </BottomSheet>
  )
}
