import { useState } from 'react'
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { BottomSheet, Spinner } from '../ui'
import { Button } from '../Button'
import { theme } from '../../constants'
import { DEVICE_LOCATION_TIMEOUT_MS, FEED_CITY_COPY, FEED_REGIONS } from '../../constants/feedRegions'
import { useFeedCity } from '../../hooks/useFeedCity'
import { nearestFeedRegion } from '../../utils/feedRegion'
import type { FeedCityLineProps, FeedCitySheetProps } from '../../types/feedRegion'

/**
 * "Games around Dallas · Change" above the Events feed (#339), and the sheet it opens: the cities
 * vteam covers, and "Use my location". The line is the only place the city shows; the feed,
 * Tournaments, Leagues and Search all follow `useFeedCity()`.
 */
export function FeedCityLine({ style }: FeedCityLineProps) {
  const city = useFeedCity()
  const [open, setOpen] = useState(false)
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[styles.line, style]}
        accessibilityRole="button"
        accessibilityLabel={`${FEED_CITY_COPY.line} ${city.name}. ${FEED_CITY_COPY.change}`}
        testID="feed-city"
      >
        <Ionicons name="location-outline" size={18} color={theme.colors.subtext} />
        <Text style={styles.lineText} numberOfLines={1}>
          {FEED_CITY_COPY.line} <Text style={styles.lineCity}>{city.name}</Text>
        </Text>
        <Text style={styles.change}>{FEED_CITY_COPY.change}</Text>
      </TouchableOpacity>
      <FeedCitySheet visible={open} onDismiss={() => setOpen(false)} city={city} />
    </>
  )
}

/**
 * "Austin ▾": the same control as FeedCityLine, small enough for the row above the phone
 * feed's days (Party invite). Same test id and spoken label, so the city flow checks either.
 */
export function FeedCityPill() {
  const city = useFeedCity()
  const [open, setOpen] = useState(false)
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={styles.pill}
        hitSlop={{ top: 6, bottom: 6 }}
        accessibilityRole="button"
        accessibilityLabel={`${FEED_CITY_COPY.line} ${city.name}. ${FEED_CITY_COPY.change}`}
        testID="feed-city"
      >
        <Ionicons name="location-outline" size={15} color={theme.colors.primaryText} />
        <Text style={styles.pillText} numberOfLines={1}>{city.name}</Text>
        <Ionicons name="chevron-down" size={14} color={theme.colors.subtext} />
      </TouchableOpacity>
      <FeedCitySheet visible={open} onDismiss={() => setOpen(false)} city={city} />
    </>
  )
}

/** The browser's location API; the phone apps don't have a location module yet (next store build). */
const canLocate = (): boolean =>
  Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.geolocation

export function FeedCitySheet({ visible, onDismiss, city }: FeedCitySheetProps) {
  const [locating, setLocating] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const close = () => { setNote(null); setLocating(false); onDismiss() }

  const useMyLocation = () => {
    if (!canLocate() || locating) return
    setLocating(true)
    setNote(null)
    // Asks for permission only here, from this tap. The position is used once, never stored.
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false)
        const region = nearestFeedRegion(pos.coords.latitude, pos.coords.longitude)
        if (!region) { setNote(FEED_CITY_COPY.tooFar); return }
        city.pick(region, 'device')
        close()
      },
      () => { setLocating(false); setNote(FEED_CITY_COPY.denied) },
      { maximumAge: 10 * 60_000, timeout: DEVICE_LOCATION_TIMEOUT_MS, enableHighAccuracy: false },
    )
  }

  return (
    <BottomSheet visible={visible} onDismiss={close} title={FEED_CITY_COPY.sheetTitle}>
      <View style={styles.options} role="radiogroup" aria-label={FEED_CITY_COPY.sheetTitle}>
        {FEED_REGIONS.map(r => {
          const on = r.id === city.region
          return (
            <TouchableOpacity
              key={r.id}
              onPress={() => { city.pick(r.id, 'list'); close() }}
              style={[styles.option, on && styles.optionOn]}
              role="radio"
              aria-checked={on}
              accessibilityState={{ selected: on }}
              testID={`feed-city-${r.id}`}
            >
              <Text style={styles.optionText}>{r.name}</Text>
              {city.nearest === r.id ? <Text style={styles.optionNote}>{FEED_CITY_COPY.nearest}</Text> : null}
              {on ? <Ionicons name="checkmark" size={20} color={theme.colors.primaryText} /> : null}
            </TouchableOpacity>
          )
        })}
      </View>
      {canLocate() ? (
        <View style={styles.locate}>
          {locating ? (
            <View style={styles.locating}><Spinner label={FEED_CITY_COPY.locating} /><Text style={styles.optionNote}>{FEED_CITY_COPY.locating}</Text></View>
          ) : (
            <Button label={FEED_CITY_COPY.useLocation} icon="navigate-outline" variant="secondary" onPress={useMyLocation} testID="feed-city-locate" />
          )}
          <Text style={styles.note} role={note ? 'alert' : undefined}>{note ?? FEED_CITY_COPY.note}</Text>
        </View>
      ) : null}
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  line: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 12,
    borderRadius: theme.radius.full, backgroundColor: theme.colors.card,
  },
  pillText: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm, color: theme.colors.text, maxWidth: 140 },
  lineText: { flex: 1, fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext },
  lineCity: { fontFamily: theme.fonts.bodySemiBold, color: theme.colors.text },
  change: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm, color: theme.colors.timeText },
  options: { gap: theme.spacing.sm },
  option: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  optionOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.background },
  optionText: { flex: 1, fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.text },
  optionNote: { fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext },
  locate: { marginTop: theme.spacing.md, gap: theme.spacing.sm },
  locating: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm },
  note: { fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext },
})
