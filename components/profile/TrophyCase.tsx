import { View } from 'react-native'
import { Text } from '../ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme } from '../../constants/theme'

/** Placeholder until received cheers can be listed on the profile. */
export function RecentCheersPlaceholder() {
  return (
    <View style={{ marginTop: theme.spacing.lg }}>
      <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.lg, color: theme.colors.text, marginBottom: theme.spacing.sm }}>Recent cheers</Text>
      <View style={{ backgroundColor: theme.colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons name="star-outline" size={28} color={theme.colors.border} />
        <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.subtext, textAlign: 'center' }}>
          Cheers you receive from teammates will show up here.
        </Text>
      </View>
    </View>
  )
}

const PLACES = [
  { place: '1', color: theme.colors.medalGold, label: '1st place' },
  { place: '2', color: theme.colors.medalSilver, label: '2nd place' },
  { place: '3', color: theme.colors.medalBronze, label: '3rd place' },
] as const

/** Placeholder podium: trophies are not tracked on profiles yet, so every slot is empty. */
export function TrophyCase() {
  return (
    <View style={{ marginTop: theme.spacing.md }}>
      <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.lg, color: theme.colors.text, marginBottom: theme.spacing.sm }}>Trophy case</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {PLACES.map(t => (
          <View key={t.place} style={{ flex: 1, backgroundColor: theme.colors.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center' }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.color, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
              <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.lg, color: theme.colors.background }}>{t.place}</Text>
            </View>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, fontWeight: '700', color: theme.colors.subtext, textAlign: 'center' }}>{t.label}</Text>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext, marginTop: 2, opacity: 0.6 }}>—</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
