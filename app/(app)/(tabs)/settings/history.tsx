import React, { useEffect, useState } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'
import { Text } from '../../../../components/ui/Text'
import { RefreshControl } from '../../../../components/RefreshControl'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { supabase } from '../../../../lib/supabase'
import { getSessionUser } from '../../../../lib/sessionUser'
import { EventCard } from '../../../../components/EventCard'
import { shared, EVENT_CARD_LIST_SELECT_MINIMAL } from '../../../../constants'
import { theme } from '../../../../constants/theme'
import type { EventWithDetails } from '../../../../types'
import { Spinner } from '../../../../components/ui/Spinner'

type HistoryFilter = 'attended' | 'hosted'
const HISTORY_LIMIT = 20

export default function ProfileHistoryScreen() {
  useStackBackTitle('History')
  const router = useRouter()
  const { filter } = useLocalSearchParams<{ filter?: HistoryFilter }>()
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>(filter === 'hosted' ? 'hosted' : 'attended')

  // Keep URL in sync with active filter so router.back() restores the correct tab on remount
  function switchFilter(next: HistoryFilter) {
    setHistoryFilter(next)
    router.setParams({ filter: next })
  }
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attendedEvents, setAttendedEvents] = useState<EventWithDetails[]>([])
  const [hostedEvents, setHostedEvents] = useState<EventWithDetails[]>([])
  const [attendedFetched, setAttendedFetched] = useState(false)
  const [hostedFetched, setHostedFetched] = useState(false)

  useEffect(() => {
    void fetchAttended()
  }, [])

  // Lazy-load hosted only when the tab is first opened
  useEffect(() => {
    if (historyFilter === 'hosted' && !hostedFetched) void fetchHosted()
  }, [historyFilter, hostedFetched])

  async function fetchAttended(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true)
    setError(null)
    const user = await getSessionUser()
    if (!user) { setLoading(false); return }

    const now = new Date().toISOString()
    const { data, error: err } = await supabase
      .from('events')
      .select(`${EVENT_CARD_LIST_SELECT_MINIMAL}, event_attendees!inner(user_id, status)`)
      .eq('event_attendees.user_id', user.id)
      .eq('event_attendees.status', 'attending')
      .lt('event_date', now)
      .order('event_date', { ascending: false })
      .limit(HISTORY_LIMIT)

    if (err) setError(err.message)
    else setAttendedEvents((data ?? []) as EventWithDetails[])
    setAttendedFetched(true)
    setLoading(false)
  }

  async function fetchHosted(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true)
    setError(null)
    const user = await getSessionUser()
    if (!user) { setLoading(false); return }

    const now = new Date().toISOString()
    const { data, error: err } = await supabase
      .from('events')
      .select(EVENT_CARD_LIST_SELECT_MINIMAL)
      .eq('created_by', user.id)
      .lt('event_date', now)
      .order('event_date', { ascending: false })
      .limit(HISTORY_LIMIT)

    if (err) setError(err.message)
    else setHostedEvents((data ?? []) as EventWithDetails[])
    setHostedFetched(true)
    setLoading(false)
  }

  async function handleRefresh() {
    setRefreshing(true)
    if (historyFilter === 'attended') {
      await fetchAttended({ silent: true })
    } else {
      await fetchHosted({ silent: true })
    }
    setRefreshing(false)
  }

  const events = historyFilter === 'attended' ? attendedEvents : hostedEvents
  const emptyMessage = historyFilter === 'attended'
    ? 'No past events attended.'
    : 'No past hosted events.'

  return (
    <View style={shared.screen}>
      <ScrollView
        contentContainerStyle={shared.scrollContentSubpage}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
      >
        <View style={shared.card}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <HistoryChip
              label="Attended"
              active={historyFilter === 'attended'}
              onPress={() => switchFilter('attended')}
            />
            <HistoryChip
              label="Hosted"
              active={historyFilter === 'hosted'}
              onPress={() => switchFilter('hosted')}
            />
          </View>

          <View style={shared.mt_md} />

          {loading ? (
            <Spinner color={theme.colors.primary} />
          ) : error ? (
            <Text style={shared.errorText}>{error}</Text>
          ) : events.length === 0 ? (
            <Text style={shared.caption}>{emptyMessage}</Text>
          ) : (
            events.map(event => (
              <EventCard
                key={event.id}
                event={event}
                from={`/settings/history?filter=${historyFilter}`}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  )
}

function HistoryChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      style={{
        borderRadius: theme.radius.full,
        borderWidth: 1,
        borderColor: active ? theme.colors.primary : theme.colors.border,
        backgroundColor: active ? theme.colors.primary + '14' : theme.colors.card,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <Text style={{
        fontSize: theme.font.size.md,
        lineHeight: theme.font.lineHeight.normal,
        fontWeight: active ? theme.font.weight.semibold : theme.font.weight.regular,
        color: active ? theme.colors.primary : theme.colors.text,
      }}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}
