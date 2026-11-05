import React, { useCallback, useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Text } from '../../../../components/ui/Text'
import { RefreshControl } from '../../../../components/RefreshControl'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { supabase } from '../../../../lib/supabase'
import { getSessionUser } from '../../../../lib/sessionUser'
import { EventCard } from '../../../../components/EventCard'
import { shared, theme, EVENT_CARD_LIST_SELECT_MINIMAL } from '../../../../constants'
import type { EventWithDetails } from '../../../../types'
import { Spinner } from '../../../../components/ui/Spinner'

export default function ProfileHostedEventsScreen() {
  useStackBackTitle('Hosted events')
  const [events, setEvents] = useState<EventWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadHosted = useCallback(async () => {
    const user = await getSessionUser()
    if (!user) return
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('events')
      .select(EVENT_CARD_LIST_SELECT_MINIMAL)
      .eq('created_by', user.id)
      .gte('event_date', now)
      .order('event_date', { ascending: true })

    if (!error) setEvents((data ?? []) as EventWithDetails[])
  }, [])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const user = await getSessionUser()
        if (!user) return
        await loadHosted()
      } finally {
        setLoading(false)
      }
    })()
  }, [loadHosted])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await loadHosted()
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) return (
    <View style={[shared.screen, { alignItems: 'center', justifyContent: 'center' }]}>
      <Spinner color={theme.colors.primary} />
    </View>
  )

  return (
    <View style={shared.screen}>
      <ScrollView
        contentContainerStyle={shared.scrollContentSubpage}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor={theme.colors.primary} />
        }
      >
        <View style={shared.card}>
          {events.length === 0 ? (
            <Text style={shared.caption}>No upcoming hosted events.</Text>
          ) : (
            events.map(event => <EventCard key={event.id} event={event} from="/settings/hosted" />)
          )}
        </View>
      </ScrollView>
    </View>
  )
}
