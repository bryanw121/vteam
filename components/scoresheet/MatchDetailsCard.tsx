import { useState } from 'react'
import { View } from 'react-native'
import { Text } from '../ui/Text'
import { Chip } from '../ui'
import { Button } from '../Button'
import { Input } from '../Input'
import { shared, theme } from '../../constants'
import type { MatchDetailsCardProps, MatchInfo } from '../../types'

const FIELDS: { key: keyof MatchInfo; label: string; max: number }[] = [
  { key: 'competition', label: 'Competition', max: 80 },
  { key: 'court', label: 'Court', max: 20 },
  { key: 'matchNo', label: 'Match no.', max: 20 },
  { key: 'hall', label: 'Hall', max: 60 },
  { key: 'city', label: 'City, state', max: 60 },
  { key: 'division', label: 'Level / division', max: 40 },
  { key: 'firstReferee', label: '1st referee', max: 60 },
  { key: 'secondReferee', label: '2nd referee', max: 60 },
  { key: 'scorer', label: 'Scorer', max: 60 },
]
const filled = (info: MatchInfo, key: keyof MatchInfo) => !!String(info[key] ?? '').trim()

/**
 * The sheet header and officials, editable after the match (when there is time), so the paper
 * and PDF headers aren't left blank. Says how many are blank; opens on "Add".
 */
export function MatchDetailsCard({ info, onChange }: MatchDetailsCardProps) {
  const missing = FIELDS.filter(f => !filled(info, f.key))
  const [open, setOpen] = useState(false)
  return (
    <View style={[shared.card, { gap: theme.spacing.sm, marginBottom: theme.spacing.sm }]} testID="match-details">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Text style={shared.subheading}>Match details</Text>
          <Text style={shared.caption}>{missing.length ? `For the sheet header: ${missing.length} blank` : 'All filled in'}</Text>
        </View>
        <Button label={open ? 'Done' : missing.length ? 'Add' : 'Edit'} variant="ghost" onPress={() => setOpen(v => !v)} testID="match-details-toggle" />
      </View>
      {open && (
        <View style={{ gap: theme.spacing.sm }}>
          {FIELDS.map(f => (
            <Input key={f.key} label={f.label} value={String(info[f.key] ?? '')} onChangeText={v => onChange({ [f.key]: v })} maxLength={f.max} testID={`detail-${f.key}`} />
          ))}
          <View role="radiogroup" style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {(['men', 'women', 'coed'] as const).map(g => (
              <Chip key={g} label={{ men: 'Men', women: 'Women', coed: 'CoEd' }[g]} role="radio" variant="tint" active={info.gender === g} onPress={() => onChange({ gender: info.gender === g ? undefined : g })} />
            ))}
          </View>
          <Text style={shared.caption}>Saved as you type. The competition, hall, court and officials carry over to your next match today.</Text>
        </View>
      )}
    </View>
  )
}
