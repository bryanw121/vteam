import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import { profileFullName, profileInitial } from '../../utils'
import { percentOf } from '../../utils/metrics'
import { metricsStyles as s } from './metricsStyles'

/** A headline number with its label and a line under it (a change, or context). */
export function StatCard({ label, value, sub, subTone = 'note', testID }: {
  label: string
  value: string
  sub?: string | null
  /** 'up' / 'down' colour a change; 'note' is plain context. */
  subTone?: 'up' | 'down' | 'note'
  testID?: string
}) {
  return (
    <View style={[s.card, s.gridCell, { gap: theme.spacing.xxs }]} testID={testID}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.big}>{value}</Text>
      {sub ? <Text style={subTone === 'note' ? s.note : [s.delta, subTone === 'down' && s.deltaDown]}>{sub}</Text> : null}
    </View>
  )
}

/** A titled card. */
export function MetricCard({ title, aside, children, highlight, testID }: {
  title?: string
  aside?: string
  children: ReactNode
  highlight?: boolean
  testID?: string
}) {
  return (
    <View style={[s.card, highlight && s.cardHighlight]} testID={testID}>
      {title ? (
        <View style={s.cardTitleRow}>
          <Text style={s.cardTitle} accessibilityRole="header">{title}</Text>
          {aside ? <Text style={s.note}>{aside}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  )
}

/** Label / number rows. */
export function CountRows({ rows }: { rows: readonly { label: string; value: string | number }[] }) {
  return (
    <View>
      {rows.map((r, i) => (
        <View key={r.label} style={[s.row, i === 0 && s.rowFirst]}>
          <Text style={s.rowLabel}>{r.label}</Text>
          <Text style={s.rowValue}>{typeof r.value === 'number' ? r.value.toLocaleString('en-US') : r.value}</Text>
        </View>
      ))}
    </View>
  )
}

type Person = { username: string; first_name: string | null; last_name: string | null }

/** A person: initials, name, a meta line and an optional number on the right. Tappable when `onPress` is set. */
export function PersonRow({ person, nameOverride, meta, metaWarn, value, online, first, onPress, testID }: {
  person: Person
  /** Shown instead of the person's name (a group row: "2 guests"). */
  nameOverride?: string
  meta: string
  /** Extra warning text after the meta line ("old build"). */
  metaWarn?: string | null
  value?: string | number
  online?: boolean
  first?: boolean
  onPress?: () => void
  testID?: string
}) {
  const name = nameOverride ?? profileFullName(person)
  const body = (
    <>
      <View style={s.avatar}>
        <Text style={s.avatarText}>{profileInitial(person)}</Text>
        {online ? <View style={s.onlineDot} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.rowLabel, { fontFamily: theme.fonts.bodySemiBold }]} numberOfLines={1}>{name}</Text>
        <Text style={s.note} numberOfLines={2}>
          {meta}
          {metaWarn ? <Text style={[s.note, { color: theme.colors.warning }]}>{` · ${metaWarn}`}</Text> : null}
        </Text>
      </View>
      {value !== undefined ? <Text style={s.rowValue}>{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={theme.colors.subtext} /> : null}
    </>
  )
  const style = [s.row, { minHeight: 56, gap: theme.spacing.md }, first && s.rowFirst]
  if (!onPress) return <View style={style} testID={testID}>{body}</View>
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${online ? 'Online now. ' : ''}${meta}${metaWarn ? `, ${metaWarn}` : ''}`}
      testID={testID}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [...style, (pressed || hovered) && { backgroundColor: theme.colors.borderSoft }]}
    >
      {body}
    </Pressable>
  )
}

/** Funnel steps as bars scaled to the first step, each with its share of the step before. */
export function FunnelBars({ steps }: { steps: readonly { label: string; n: number }[] }) {
  const first = steps[0]?.n ?? 0
  return (
    <View style={{ gap: 6 }}>
      {steps.map((step, i) => {
        const width = Math.max(percentOf(step.n, first) ?? 0, 8)
        const ofPrev = i === 0 ? null : percentOf(step.n, steps[i - 1].n)
        return (
          <View key={step.label} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, minHeight: 28, justifyContent: 'center', paddingHorizontal: theme.spacing.sm }}>
              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${width}%`, borderRadius: 6, backgroundColor: theme.colors.primarySoft }} />
              <Text style={[s.label, { color: theme.colors.text }]}>{`${step.label} · ${step.n}`}</Text>
            </View>
            {ofPrev !== null ? <Text style={[s.label, { color: theme.colors.subtextStrong, minWidth: 40, textAlign: 'right' }]}>{`${ofPrev}%`}</Text> : null}
          </View>
        )
      })}
    </View>
  )
}
