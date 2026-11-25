import { StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { theme } from '../../constants/theme'
import type { UserTrophy } from '../../types'
import { formatDate } from '../../utils/dateFormat'

const PLACES = [
  { place: 1, color: theme.colors.medalGold, label: '1st place' },
  { place: 2, color: theme.colors.medalSilver, label: '2nd place' },
  { place: 3, color: theme.colors.medalBronze, label: '3rd place' },
] as const

/** How many recent trophies are shown. */
const RECENT = 4

type Props = {
  trophies?: UserTrophy[]
  /** "You" on your own profile changes the empty line. */
  own?: boolean
}

/** Trophies: a medal count per place beside the heading, then the latest trophies as tiles. */
export function TrophyCase({ trophies = [], own = false }: Props) {
  const place = (n: number) => PLACES.find(p => p.place === n)
  return (
    <View style={styles.wrap} testID="trophy-case">
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">Trophies</Text>
        <View style={styles.counts}>
          {PLACES.map(t => {
            const count = trophies.filter(x => x.place === t.place).length
            return (
              <View key={t.place} style={[styles.count, count === 0 && styles.countEmpty]} accessible accessibilityLabel={`${t.label}: ${count}`}>
                <View style={[styles.dot, { backgroundColor: t.color }]} />
                <Text testID={`trophy-count-${t.place}`} style={styles.countText}>{count > 0 ? count : '—'}</Text>
              </View>
            )
          })}
        </View>
      </View>
      {trophies.length === 0 ? (
        <Text style={styles.empty}>
          {own ? 'Finish on a tournament podium to earn your first trophy.' : 'No tournament trophies yet.'}
        </Text>
      ) : (
        <View style={styles.grid}>
          {trophies.slice(0, RECENT).map(t => (
            <View
              key={t.id}
              style={styles.tile}
              accessible
              accessibilityLabel={`${place(t.place)?.label ?? ''}, ${t.tournament_title}, with ${t.team_name}`}
            >
              <View style={[styles.medal, { backgroundColor: place(t.place)?.color ?? theme.colors.border }]}>
                <Text style={styles.medalText}>{t.place}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={styles.tileTitle}>{t.tournament_title}</Text>
                <Text numberOfLines={1} style={styles.tileSub}>
                  {formatDate(new Date(t.tournament_date), { month: 'short', year: 'numeric' })}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: theme.spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.sm },
  title: { fontFamily: theme.fonts.display, fontSize: theme.font.size.lg, color: theme.colors.text },
  counts: { flexDirection: 'row', gap: 6 },
  count: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.card,
  },
  countEmpty: { opacity: 0.7 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  countText: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm, color: theme.colors.text },
  empty: { fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 12,
  },
  medal: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  medalText: { fontFamily: theme.fonts.display, fontSize: theme.font.size.md, color: theme.colors.black },
  tileTitle: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.smd, color: theme.colors.text },
  tileSub: { fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext },
})
