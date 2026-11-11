import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Text } from '../../../../../components/ui/Text'
import { EmptyState, ScreenContainer, Spinner } from '../../../../../components/ui'
import { MetricsTabs } from '../../../../../components/metrics/MetricsTabs'
import { OverviewPanel } from '../../../../../components/metrics/OverviewPanel'
import { LivePanel } from '../../../../../components/metrics/LivePanel'
import { PeoplePanel } from '../../../../../components/metrics/PeoplePanel'
import { RetentionPanel } from '../../../../../components/metrics/RetentionPanel'
import { useStackBackTitle } from '../../../../../hooks/useStackBackTitle'
import { useIsAdmin } from '../../../../../hooks/useAdminMetrics'
import { useTabsShell } from '../../../../../contexts/tabs'
import { shared, theme } from '../../../../../constants'
import { routes } from '../../../../../utils/routes'
import type { MetricsTab } from '../../../../../types'

const TAB_IDS: readonly MetricsTab[] = ['overview', 'live', 'people', 'retention']

/**
 * Profile → Admin metrics (#232 design, part 2): Overview · Live · People · Retention. Every
 * number comes from an admin_* function that refuses anyone not in app_admins; the check here
 * only decides what to draw.
 */
export default function AdminMetricsScreen() {
  useStackBackTitle('Admin metrics')
  const router = useRouter()
  const { tabBarHeight } = useTabsShell()
  const params = useLocalSearchParams<{ tab?: string }>()
  const initial = TAB_IDS.includes(params.tab as MetricsTab) ? (params.tab as MetricsTab) : 'overview'
  const [tab, setTab] = useState<MetricsTab>(initial)
  const { isAdmin, checked } = useIsAdmin()

  const changeTab = (next: MetricsTab) => {
    setTab(next)
    router.setParams({ tab: next === 'overview' ? undefined : next })
  }
  const openPerson = (id: string) => router.push(routes.metricsPerson(id))

  return (
    <View style={shared.screen}>
      <ScrollView
        contentContainerStyle={[shared.scrollContentSubpage, { paddingBottom: tabBarHeight + theme.spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenContainer>
          {!checked ? (
            <View style={shared.screenStateCenter}><Spinner label="Checking access" /></View>
          ) : !isAdmin ? (
            <EmptyState icon="lock-closed-outline" title="Admins only" body="Usage metrics are only available to vteam admins." />
          ) : (
            <View style={{ gap: theme.spacing.md }}>
              <Text style={[shared.caption, { marginTop: -theme.spacing.xs }]}>Admins only · America/Chicago days</Text>
              <MetricsTabs active={tab} onChange={changeTab} />
              {tab === 'overview' && <OverviewPanel onOpenLive={() => changeTab('live')} />}
              {tab === 'live' && <LivePanel active onOpenPerson={openPerson} />}
              {tab === 'people' && <PeoplePanel active onOpenPerson={openPerson} />}
              {tab === 'retention' && <RetentionPanel active />}
            </View>
          )}
        </ScreenContainer>
      </ScrollView>
    </View>
  )
}
