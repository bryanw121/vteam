import React, { useState } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'
import { Text } from '../../../../components/ui/Text'
import { RefreshControl } from '../../../../components/RefreshControl'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { useFocusRefetch } from '../../../../lib/query'
import { useSession } from '../../../../contexts/session'
import { eventHistoryKey, useEventHistory } from '../../../../hooks/useEventHistory'
import { ScreenState } from '../../../../components/ui'
import { HISTORY_LOAD_ERROR } from '../../../../constants/copy'
import { EventCard } from '../../../../components/EventCard'
import { shared } from '../../../../constants'
import { theme } from '../../../../constants/theme'

type HistoryFilter = 'attended' | 'hosted'

export default function ProfileHistoryScreen() {
  useStackBackTitle('History')
  const router = useRouter()
  const { userId } = useSession()
  const { filter } = useLocalSearchParams<{ filter?: HistoryFilter }>()
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>(filter === 'hosted' ? 'hosted' : 'attended')

  // Keep URL in sync with active filter so router.back() restores the correct tab on remount
  function switchFilter(next: HistoryFilter) {
    setHistoryFilter(next)
    router.setParams({ filter: next })
  }
  const attended = useEventHistory('attended')
  // Hosted loads the first time its tab is opened, then stays cached.
  const hosted = useEventHistory('hosted-past', { enabled: historyFilter === 'hosted' })
  const active = historyFilter === 'attended' ? attended : hosted
  useFocusRefetch(eventHistoryKey(historyFilter === 'attended' ? 'attended' : 'hosted-past', userId))
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await active.refetch({ force: true })
    } finally {
      setRefreshing(false)
    }
  }

  const events = active.data ?? []
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

          <ScreenState
            loading={active.isLoading}
            ready={active.data !== undefined}
            error={active.error ? HISTORY_LOAD_ERROR : null}
            onRetry={() => void active.refetch({ force: true })}
          >
            {events.length === 0 ? (
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
          </ScreenState>
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
