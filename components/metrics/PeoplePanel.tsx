import { useEffect, useState } from 'react'
import { View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text, TextInput } from '../ui/Text'
import { Chip, ScreenState } from '../ui'
import { Button } from '../Button'
import { theme } from '../../constants'
import { ADMIN_USERS_PAGE, useAdminUsers } from '../../hooks/useAdminMetrics'
import { lastSeenLabel, platformVersion } from '../../utils/metrics'
import type { AdminUserRow, AdminUserSort } from '../../types'
import { PersonRow } from './MetricBits'
import { metricsStyles as s } from './metricsStyles'

type Props = {
  active: boolean
  onOpenPerson: (id: string) => void
}

const SORTS: { id: AdminUserSort; label: string }[] = [
  { id: 'last_seen', label: 'Last seen' },
  { id: 'active', label: 'Most active' },
  { id: 'newest', label: 'Newest' },
]

/** Metrics → People: every account, searchable, with last seen, platform and sessions. */
export function PeoplePanel({ active, onOpenPerson }: Props) {
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<AdminUserSort>('last_seen')
  const [pages, setPages] = useState(1)

  // Search once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(input); setPages(1) }, 300)
    return () => clearTimeout(t)
  }, [input])

  const { data, isLoading, isFetching, error, refetch } = useAdminUsers(search, sort, pages, { enabled: active })
  const shown = data?.rows.length ?? 0
  const more = data ? Math.max(0, data.total - shown) : 0

  return (
    <View style={s.stack}>
      <View style={[s.card, { flexDirection: 'row', alignItems: 'center', paddingVertical: 0, minHeight: 48 }]}>
        <Ionicons name="search" size={18} color={theme.colors.subtext} />
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Search by name or username"
          placeholderTextColor={theme.colors.subtext}
          accessibilityLabel="Search people"
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1, minHeight: 46, color: theme.colors.text, fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.base }}
          testID="metrics-people-search"
        />
      </View>
      <View style={s.chips} role="radiogroup" aria-label="Sort">
        <Text style={s.label}>Sort</Text>
        {SORTS.map(o => (
          <Chip key={o.id} label={o.label} active={sort === o.id} role="radio" size="touch" onPress={() => { setSort(o.id); setPages(1) }} testID={`metrics-sort-${o.id}`} />
        ))}
      </View>
      <ScreenState loading={isLoading} ready={!!data} error={error ? 'Could not load people.' : null} onRetry={() => void refetch({ force: true })}
        empty={!!data && data.rows.length === 0} emptyIcon="people-outline" emptyTitle={search ? 'Nobody matches' : 'No accounts yet'}>
        {data ? (
          <View style={s.stack}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: theme.spacing.sm }}>
              <Text style={s.note}>{`${data.total} ${data.total === 1 ? 'account' : 'accounts'} · ${data.active_30d} active in 30 days`}</Text>
              <Text style={s.note}>Sessions 30d</Text>
            </View>
            <View style={[s.card, { paddingVertical: 0 }]}>
              {data.rows.map((row, i) => (
                <PersonRow
                  key={row.id}
                  first={i === 0}
                  person={row}
                  online={row.online}
                  meta={personMeta(row)}
                  metaWarn={row.old_build ? 'old build' : null}
                  value={row.sessions_30d}
                  onPress={() => onOpenPerson(row.id)}
                  testID={`metrics-person-${row.id}`}
                />
              ))}
            </View>
            {more > 0 ? (
              <Button
                label={`Show ${Math.min(more, ADMIN_USERS_PAGE)} more`}
                variant="secondary"
                loading={isFetching}
                onPress={() => setPages(p => p + 1)}
              />
            ) : null}
          </View>
        ) : null}
      </ScreenState>
    </View>
  )
}

function personMeta(row: AdminUserRow): string {
  if (!row.last_seen && row.created_at) {
    const when = lastSeenLabel(row.created_at, false)
    return `Signed up ${when === 'Yesterday' ? 'yesterday' : when} · no sessions since`
  }
  return `${lastSeenLabel(row.last_seen, row.online)} · ${platformVersion(row.platform, row.app_version)}`
}
