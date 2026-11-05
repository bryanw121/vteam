import { useEffect, useMemo, useState } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'
import { Text } from '../../components/ui/Text'
import { RefreshControl } from '../../components/RefreshControl'
import { useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Chip, ScreenContainer, ScreenHeader, ScreenState } from '../../components/ui'
import { DayStrip } from '../../components/book/DayStrip'
import { FacilityCard } from '../../components/book/FacilityCard'
import { shared, theme, COURTS_DAYS, SURFACE_OPTIONS } from '../../constants'
import { useCourtAvailability } from '../../hooks/useCourtAvailability'
import { useRequireSignIn } from '../../hooks/useRequireSignIn'
import { openExternalUrl } from '../../lib/openExternalUrl'
import {
  austinNow, courtsAgeMs, dayOptions, dayParts, facilityDays, formatAge, gridSpan, isCourtsOld, pickDay, venueCalendarUrl,
} from '../../utils/courts'
import { signupHost } from '../../utils/feedItems'
import { routes } from '../../utils/routes'
import type { AustinNow, FacilityDay, SurfaceFilter } from '../../types'

/**
 * Book a court: when Austin's rentable courts are free over the next week
 * (Schelagg's court calendars), and a way out to each venue's booking page.
 * Public: guests can look; only "Create a vteam event" needs an account.
 */
export default function BookCourtScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const requireSignIn = useRequireSignIn()
  const { data, error, isLoading, isFetching, refetch } = useCourtAvailability()

  // "Now" in Austin, ticking each minute so the now line and "free now" move.
  const [now, setNow] = useState<AustinNow>(() => austinNow())
  useEffect(() => {
    const id = setInterval(() => setNow(austinNow()), 60_000)
    return () => clearInterval(id)
  }, [])

  const days = useMemo(() => dayOptions(now.iso, COURTS_DAYS), [now.iso])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const dayIso = pickDay(selectedDay, days)
  const [surface, setSurface] = useState<SurfaceFilter>('any')

  const surfaces = useMemo(() => {
    const present = new Set(data?.venues.flatMap(v => v.facilities.map(f => f.surface)) ?? [])
    return SURFACE_OPTIONS.filter(o => present.has(o.id))
  }, [data])

  const facilities = useMemo(
    () => (data ? facilityDays(data, dayIso, now, surface) : []),
    [data, dayIso, now, surface],
  )
  const span = useMemo(() => gridSpan(facilities), [facilities])
  const freeDays = useMemo(() => {
    const out = new Set<string>()
    if (data) {
      for (const d of days) {
        if (facilityDays(data, d.iso, now, surface).some(f => f.freeSummary.length > 0)) out.add(d.iso)
      }
    }
    return out
  }, [data, days, now, surface])

  const isToday = dayIso === now.iso
  const ageMs = data ? courtsAgeMs(data.fetchedAt) : 0
  const old = data ? isCourtsOld(data.fetchedAt) : false
  const errors = data?.errors ?? []

  function goBack() {
    if (router.canGoBack()) router.back()
    else router.replace(routes.events())
  }

  function book(day: FacilityDay) {
    // Open the venue's calendar on the day being viewed when its platform supports it.
    void openExternalUrl(venueCalendarUrl(day.venue, dayIso))
  }

  function createEvent(day: FacilityDay) {
    const path = routes.host({ location: day.facility.name, surface: day.facility.surface })
    // Hosting needs an account; guests sign in and come back here.
    if (!requireSignIn()) return
    router.push(path)
  }

  return (
    <View style={[shared.screen, { paddingTop: insets.top }]}>
      <ScreenContainer maxWidth={900}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing.xl }}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !!data}
              onRefresh={() => void refetch({ force: true })}
              tintColor={theme.colors.primary}
            />
          }
        >
          <ScreenHeader kicker="Courts around Austin" title="Book a court" onBack={goBack} />
          <View style={shared.bookContent}>
          <Text style={shared.bookIntro}>
            Open court time at venues that rent by the hour. Pick a day, find a gap, then book on the venue's site.
          </Text>

          <DayStrip days={days} selected={dayIso} freeDays={freeDays} onSelect={setSelectedDay} />

          {surfaces.length > 1 ? (
            <View style={shared.bookChips}>
              <Chip label="All" active={surface === 'any'} onPress={() => setSurface('any')} testID="book-surface-any" />
              {surfaces.map(o => (
                <Chip
                  key={o.id}
                  label={o.label}
                  active={surface === o.id}
                  onPress={() => setSurface(surface === o.id ? 'any' : o.id)}
                  testID={`book-surface-${o.id}`}
                />
              ))}
            </View>
          ) : null}

          <ScreenState
            loading={isLoading}
            ready={!!data}
            error={error ? 'Could not load court calendars. Check your connection and try again.' : null}
            onRetry={() => void refetch({ force: true })}
            empty={!!data && facilities.length === 0 && errors.length === 0}
            emptyIcon="calendar-clear-outline"
            emptyTitle={surface === 'any' ? 'No court calendars right now' : 'No venues with this surface'}
            emptyBody={surface === 'any' ? undefined : 'Try another surface.'}
            emptyActionLabel={surface === 'any' ? undefined : 'Show all'}
            onEmptyAction={surface === 'any' ? undefined : () => setSurface('any')}
          >
            <View
              style={[shared.bookFreshness, old && shared.bookFreshnessOld]}
              testID="book-freshness"
              accessibilityLiveRegion="polite"
            >
              <Ionicons
                name={old ? 'warning-outline' : 'time-outline'}
                size={15}
                color={old ? theme.colors.warning : theme.colors.subtext}
              />
              <Text style={[shared.bookFreshnessText, old && shared.bookFreshnessTextOld]}>
                {old
                  ? `Court calendars last updated ${formatAge(ageMs)}, so they may be out of date. Check the venue's page before you go.`
                  : `Court calendars updated ${formatAge(ageMs)}${error ? ' (refresh failed)' : ''}.`}
              </Text>
            </View>

            {errors.map((e, i) => (
              <View key={`${e.venue ?? 'venue'}-${i}`} style={shared.bookError}>
                <Text style={shared.bookErrorText}>
                  Couldn't load {e.calendar ? signupHost(e.calendar) : e.venue ?? 'a venue'} right now.
                </Text>
                {e.calendar ? (
                  <TouchableOpacity
                    onPress={() => void openExternalUrl(e.calendar!)}
                    accessibilityRole="link"
                    style={shared.bookFollowUp}
                  >
                    <Text style={shared.bookFollowUpText}>Open its calendar</Text>
                    <Ionicons name="open-outline" size={14} color={theme.colors.primary} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}

            <View style={shared.bookDayHeading}>
              <Text style={shared.bookDayHeadingText} accessibilityRole="header">
                {isToday ? `Today · ${dayParts(dayIso).long}` : dayParts(dayIso).long}
              </Text>
              <View style={shared.bookLegend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <View style={shared.bookLegendItem}>
                  <View style={[shared.bookLegendSwatch, shared.bookLegendFree]} />
                  <Text style={shared.bookLegendText}>Free</Text>
                </View>
                <View style={shared.bookLegendItem}>
                  <View style={[shared.bookLegendSwatch, shared.bookLegendBooked]} />
                  <Text style={shared.bookLegendText}>Booked</Text>
                </View>
                <View style={shared.bookLegendItem}>
                  <View style={[shared.bookLegendSwatch, shared.bookLegendClosed]} />
                  <Text style={shared.bookLegendText}>Closed</Text>
                </View>
                {isToday ? (
                  <View style={shared.bookLegendItem}>
                    <View style={shared.bookLegendNow} />
                    <Text style={shared.bookLegendText}>Now</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {facilities.map(day => (
              <FacilityCard
                key={day.key}
                day={day}
                span={span}
                nowMin={isToday ? now.minutes : null}
                dayIso={dayIso}
                onBook={book}
                onCreateEvent={createEvent}
              />
            ))}

            <Text style={shared.bookFootnote}>
              Times are Austin time. Calendars show when courts are taken, not who booked them. Availability comes from
              each venue's public calendar via Schelagg and can change before you book.
            </Text>
          </ScreenState>
          </View>
        </ScrollView>
      </ScreenContainer>
    </View>
  )
}
