import { View } from 'react-native'
import { Text } from '../ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme } from '../../constants/theme'
import type { UserTrophy } from '../../types'

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
  { place: 1, color: theme.colors.medalGold, label: '1st place' },
  { place: 2, color: theme.colors.medalSilver, label: '2nd place' },
  { place: 3, color: theme.colors.medalBronze, label: '3rd place' },
] as const

/** How many recent trophies are listed under the podium counts. */
const RECENT = 5

type Props = {
  trophies?: UserTrophy[]
  /** "You" on your own profile changes the empty line. */
  own?: boolean
}

/** Podium counts (1st / 2nd / 3rd) and the latest trophies, from tournament_trophies. */
export function TrophyCase({ trophies = [], own = false }: Props) {
  const color = (place: number) => PLACES.find(p => p.place === place)?.color ?? theme.colors.border
  return (
    <View style={{ marginTop: theme.spacing.md }} testID="trophy-case">
      <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.lg, color: theme.colors.text, marginBottom: theme.spacing.sm }}>Trophy case</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {PLACES.map(t => {
          const count = trophies.filter(x => x.place === t.place).length
          return (
            <View
              key={t.place}
              accessible
              accessibilityLabel={`${t.label}: ${count}`}
              style={{ flex: 1, backgroundColor: theme.colors.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center' }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.color, alignItems: 'center', justifyContent: 'center', marginBottom: 6, opacity: count > 0 ? 1 : 0.45 }}>
                <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.lg, color: theme.colors.background }}>{t.place}</Text>
              </View>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, fontWeight: '700', color: theme.colors.subtext, textAlign: 'center' }}>{t.label}</Text>
              <Text testID={`trophy-count-${t.place}`} style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.lg, color: count > 0 ? theme.colors.text : theme.colors.subtext, marginTop: 2 }}>
                {count > 0 ? count : '—'}
              </Text>
            </View>
          )
        })}
      </View>
      {trophies.length === 0 ? (
        <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginTop: theme.spacing.sm, textAlign: 'center' }}>
          {own ? 'Finish on a tournament podium to earn your first trophy.' : 'No tournament trophies yet.'}
        </Text>
      ) : (
        <View style={{ marginTop: theme.spacing.sm, gap: 6 }}>
          {trophies.slice(0, RECENT).map(t => (
            <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.colors.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.colors.border }}>
              <Ionicons name="trophy" size={18} color={color(t.place)} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.text }}>{t.tournament_title}</Text>
                <Text numberOfLines={1} style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext }}>
                  {PLACES.find(p => p.place === t.place)?.label} with {t.team_name} · {new Date(t.tournament_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
