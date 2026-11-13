import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Text } from '../ui/Text'
import { Chip, ScreenState } from '../ui'
import { Button } from '../Button'
import { theme } from '../../constants'
import { REPORT_CONTEXT_LABELS, REPORT_REASON_LABELS } from '../../constants/reports'
import { useAdminReports, useResolveReport } from '../../hooks/useAdminMetrics'
import { toast } from '../../lib/toast'
import { reportDueLabel } from '../../utils/reports'
import { routes } from '../../utils/routes'
import { MetricCard } from './MetricBits'
import { metricsStyles as s } from './metricsStyles'
import type { AdminReport, ReportAction } from '../../types'

type Props = { active: boolean }

const STATUS_LABEL: Record<AdminReport['status'], string> = { open: 'Open', dismissed: 'Dismissed', warned: 'Warned', suspended: 'Suspended' }

/** Admin metrics → Reports (#243): open reports oldest first, with Dismiss / Warn / Suspend. */
export function ReportsPanel({ active }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState<'open' | 'all'>('open')
  const { data, isLoading, error, refetch } = useAdminReports(status, { enabled: active })
  const resolve = useResolveReport()

  const act = async (r: AdminReport, action: ReportAction) => {
    const ok = await resolve.mutate({ id: r.id, action })
    if (ok === undefined && resolve.error) toast.error("Couldn't update the report", resolve.error)
    else toast.show({ message: action === 'dismiss' ? 'Report dismissed' : action === 'warn' ? 'Warning sent' : 'Marked suspended', variant: 'success' })
  }

  return (
    <View style={s.stack}>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Chip label="Open" active={status === 'open'} onPress={() => setStatus('open')} testID="reports-filter-open" />
        <Chip label="All" active={status === 'all'} onPress={() => setStatus('all')} testID="reports-filter-all" />
      </View>
      <ScreenState loading={isLoading} ready={!!data} error={error ? 'Could not load reports.' : null} onRetry={() => void refetch({ force: true })}>
        {data && data.length === 0 ? (
          <MetricCard><Text style={s.note}>{status === 'open' ? 'No open reports.' : 'No reports yet.'}</Text></MetricCard>
        ) : null}
        {(data ?? []).map(r => (
          <MetricCard
            key={r.id}
            title={REPORT_REASON_LABELS[r.reason] ?? r.reason}
            aside={r.status === 'open' ? reportDueLabel(r.created_at) : STATUS_LABEL[r.status]}
            highlight={r.status === 'open'}
            testID={`report-${r.id}`}
          >
            <Pressable onPress={() => router.push(routes.profileOf(r.target_id))} accessibilityRole="link">
              <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.primaryText }}>
                {`${r.target_name ?? r.target_username ?? 'Player'}${r.target_username ? ` (@${r.target_username})` : ''}`}
              </Text>
            </Pressable>
            <Text style={s.note}>
              {`${REPORT_CONTEXT_LABELS[r.context_kind]} · reported by ${r.reporter_username ? `@${r.reporter_username}` : 'a deleted account'} · ${new Date(r.created_at).toLocaleString()}`}
              {r.target_open_reports > 1 ? ` · ${r.target_open_reports} open reports on this person` : ''}
            </Text>
            {r.context_snapshot ? (
              <View style={{ borderLeftWidth: 3, borderLeftColor: theme.colors.border, paddingLeft: theme.spacing.sm }}>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.text }}>{r.context_snapshot}</Text>
              </View>
            ) : null}
            {r.details ? <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.text }}>{`"${r.details}"`}</Text> : null}
            {r.status === 'open' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                <Button label="Dismiss" variant="secondary" size="sm" fullWidth={false} onPress={() => void act(r, 'dismiss')} testID={`report-dismiss-${r.id}`} />
                <Button label="Warn" variant="secondary" size="sm" fullWidth={false} onPress={() => void act(r, 'warn')} testID={`report-warn-${r.id}`} />
                <Button label="Suspend" variant="danger" size="sm" fullWidth={false} onPress={() => void act(r, 'suspend')} testID={`report-suspend-${r.id}`} />
              </View>
            ) : r.resolution_note ? <Text style={s.note}>{r.resolution_note}</Text> : null}
          </MetricCard>
        ))}
      </ScreenState>
    </View>
  )
}
