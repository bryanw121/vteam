import React, { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Text } from '../../../../components/ui/Text'
import { RefreshControl } from '../../../../components/RefreshControl'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusRefetch } from '../../../../lib/query'
import { useSession } from '../../../../contexts/session'
import { cheersSummaryKey, useCheersSummary } from '../../../../hooks/useCheersSummary'
import { ScreenState } from '../../../../components/ui'
import { CHEERS_LOAD_ERROR } from '../../../../constants/copy'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { shared, theme, CHEER_TYPES } from '../../../../constants'
import { CheerRadarChart } from '../../../../components/CheerRadarChart'

export default function ProfileCheersScreen() {
  useStackBackTitle('Cheers')

  const { userId } = useSession()
  const summary = useCheersSummary()
  // Refetch on focus only when stale (it used to reload on every visit).
  useFocusRefetch(cheersSummaryKey(userId))
  const [refreshing, setRefreshing] = useState(false)
  const totalReceived = summary.data?.totalReceived ?? 0
  const totalGiven = summary.data?.totalGiven ?? 0
  const counts = summary.data?.counts ?? {}

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await summary.refetch({ force: true })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <View style={shared.screen}>
      <ScreenState
        loading={summary.isLoading}
        ready={summary.data !== undefined}
        error={summary.error ? CHEERS_LOAD_ERROR : null}
        onRetry={() => void summary.refetch({ force: true })}
      >
      <ScrollView
        contentContainerStyle={shared.scrollContentSubpage}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor={theme.colors.primary} />
        }
      >

        {/* Summary cards */}
        <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
          <View style={[shared.card, { flex: 1, alignItems: 'center', gap: theme.spacing.xs }]}>
            <Text
              testID="cheers-received-count"
              style={{ fontSize: theme.font.size.xxl, fontWeight: theme.font.weight.bold, color: theme.colors.primaryText }}
            >
              {totalReceived}
            </Text>
            <Text style={[shared.caption, { textAlign: 'center' }]}>cheers received</Text>
          </View>
          <View style={[shared.card, { flex: 1, alignItems: 'center', gap: theme.spacing.xs }]}>
            <Text style={{ fontSize: theme.font.size.xxl, fontWeight: theme.font.weight.bold, color: theme.colors.text }}>
              {totalGiven}
            </Text>
            <Text style={[shared.caption, { textAlign: 'center' }]}>cheers given</Text>
          </View>
        </View>

        {totalReceived === 0 ? (
          <View style={[shared.card, { alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xl }]}>
            <Ionicons name="star-outline" size={36} color={theme.colors.subtext} />
            <Text style={[shared.caption, { textAlign: 'center' }]}>
              No cheers received yet.{'\n'}Attend events and play great to earn some.
            </Text>
          </View>
        ) : (
          <View style={shared.card}>
            <Text style={[shared.subheading, { marginBottom: theme.spacing.sm }]}>Breakdown</Text>
            <CheerRadarChart counts={counts} />
          </View>
        )}

      </ScrollView>
      </ScreenState>
    </View>
  )
}
