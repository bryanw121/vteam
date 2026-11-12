import React, { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Text } from '../../../../components/ui/Text'
import { RefreshControl } from '../../../../components/RefreshControl'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { useFocusRefetch } from '../../../../lib/query'
import { useSession } from '../../../../contexts/session'
import { eventHistoryKey, useEventHistory } from '../../../../hooks/useEventHistory'
import { EventCard } from '../../../../components/EventCard'
import { ScreenState } from '../../../../components/ui'
import { shared, theme } from '../../../../constants'
import { HISTORY_LOAD_ERROR } from '../../../../constants/copy'

export default function ProfileHostedEventsScreen() {
  useStackBackTitle('Hosted events')
  const { userId } = useSession()
  const hosted = useEventHistory('hosted-upcoming')
  useFocusRefetch(eventHistoryKey('hosted-upcoming', userId))
  const [refreshing, setRefreshing] = useState(false)
  const events = hosted.data ?? []

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await hosted.refetch({ force: true })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <View style={shared.screen}>
      <ScreenState
        loading={hosted.isLoading}
        ready={hosted.data !== undefined}
        error={hosted.error ? HISTORY_LOAD_ERROR : null}
        onRetry={() => void hosted.refetch({ force: true })}
      >
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
      </ScreenState>
    </View>
  )
}
