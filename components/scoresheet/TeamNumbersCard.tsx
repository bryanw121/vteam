import { Platform, View } from 'react-native'
import { Text, TextInput } from '../ui/Text'
import { Chip } from '../ui'
import { Input } from '../Input'
import { TEAM_COLORS } from './teamColors'
import { shared, theme } from '../../constants'
import { boxNumber, gridIssues } from '../../lib/scoresheet/numberGrid'
import type { GridBox, TeamNumbersCardProps } from '../../types'

/**
 * The starting six drawn where they stand, seen from behind the team's own baseline: front row
 * (left, middle, right) at the net, back row below, the server at back right. Values are indexes
 * into `court` (serving order: 0 serves first, the scoresheet's I–VI), so typing still moves
 * box to box in serving order.
 */
const FRONT_ROW = [3, 2, 1]
const BACK_ROW = [4, 5, 0]
const SPOT_NAMES = ['back right', 'front right', 'front middle', 'front left', 'back left', 'back middle']

// iOS's number pad has no Next key; this keyboard has digits and a Next key on every platform.
const KEYBOARD = Platform.select({ ios: 'numbers-and-punctuation', default: 'number-pad' } as const)

/**
 * One team's numbers, all on screen at once: the starting six in serving order, the bench
 * and the liberos. Typing two digits (or Next, or a space) moves to the next box, and a
 * pasted lineup fills the boxes after the one it was pasted into.
 */
export function TeamNumbersCard({ side, team, showMissing, onName, onType, onSubmitBox, onPaste, boxRef }: TeamNumbersCardProps) {
  const color = TEAM_COLORS[side]
  const { duplicates } = gridIssues(team)
  const label = team.name.trim() || `Team ${side}`

  const box = (b: GridBox, value: string, a11y: string, under?: string) => {
    const n = boxNumber(value)
    const repeated = n != null && duplicates.includes(n)
    const missing = showMissing && b.part === 'court' && n == null
    const playerName = n != null ? team.details[n]?.name : undefined
    return (
      <View key={`${b.part}-${b.index}`} style={b.part === 'court' ? shared.numberBoxCourtCell : shared.numberBoxCell}>
        <TextInput
          ref={boxRef(b)}
          value={value}
          onChangeText={t => onType(b, t)}
          onSubmitEditing={() => onSubmitBox(b)}
          keyboardType={KEYBOARD}
          inputMode="numeric"
          returnKeyType="next"
          blurOnSubmit={false}
          selectTextOnFocus
          autoCorrect={false}
          autoComplete="off"
          placeholder="–"
          placeholderTextColor={theme.colors.subtext}
          accessibilityLabel={`${label} ${a11y}${repeated ? ', number used twice' : ''}`}
          testID={`num-${side}-${b.part}-${b.index}`}
          style={[shared.numberBox, (repeated || missing) && { borderColor: theme.colors.error }, n != null && { borderColor: color.fill }]}
          maxFontSizeMultiplier={1.3}
        />
        <Text style={shared.numberBoxLabel} numberOfLines={1} maxFontSizeMultiplier={1.3}>{playerName ? playerName.split(' ')[0] : under ?? ''}</Text>
      </View>
    )
  }

  return (
    <View style={[shared.card, { gap: theme.spacing.sm, borderLeftWidth: 4, borderLeftColor: color.fill }]} testID={`numbers-${side}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Input
            value={team.name}
            onChangeText={onName}
            placeholder={`Team ${side} name`}
            maxLength={40}
            accessibilityLabel={`Team ${side} name`}
            testID={`team-name-${side}`}
          />
        </View>
        <Chip label="Paste" variant="tint" onPress={onPaste} testID={`roster-text-${side}`} />
      </View>

      <Text style={[shared.label, { marginBottom: 0 }]}>Starting six, where they stand</Text>
      <View style={shared.numberCourt} testID={`court-${side}`}>
        <View style={shared.numberCourtNet}>
          <Text style={shared.numberCourtNetLabel} maxFontSizeMultiplier={1.3}>NET</Text>
        </View>
        {[FRONT_ROW, BACK_ROW].map((row, r) => (
          <View key={r} style={shared.numberBoxRow}>
            {row.map(i => box(
              { part: 'court', index: i },
              team.court[i],
              `${SPOT_NAMES[i]}${i === 0 ? ', serves first' : ''}`,
              i === 0 ? 'Serves first' : undefined,
            ))}
          </View>
        ))}
      </View>

      <Text style={[shared.label, { marginBottom: 0 }]}>Subs on the bench</Text>
      <View style={[shared.numberBoxRow, { flexWrap: 'wrap' }]}>
        {team.bench.map((v, i) => box({ part: 'bench', index: i }, v, `bench ${i + 1}`))}
      </View>

      <Text style={[shared.label, { marginBottom: 0 }]}>Libero (if they have one)</Text>
      <View style={shared.numberBoxRow}>
        {team.liberos.map((v, i) => box({ part: 'liberos', index: i }, v, `libero ${i + 1}`))}
      </View>

      {duplicates.length > 0 && (
        <Text style={[shared.caption, { color: theme.colors.error }]} accessibilityRole="alert">
          {duplicates.map(n => `#${n}`).join(', ')} {duplicates.length === 1 ? 'is' : 'are'} in more than one box.
        </Text>
      )}
    </View>
  )
}
