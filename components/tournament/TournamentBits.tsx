import React from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import { profileAvatarSmallUri } from '../../utils'
import { ProfileAvatar } from '../ProfileAvatar'
import type { Profile } from '../../types'
import { ts } from './tournamentStyles'

/** Small presentational pieces shared by the tournament components. */

export function AutoAvatar({ avatarUrl, border, size }: { avatarUrl?: string | null; border?: Profile['selected_border']; size: number }) {
  // Public bucket: built synchronously, so rosters paint avatars on the first render.
  return <ProfileAvatar uri={profileAvatarSmallUri(avatarUrl)} border={border ?? null} size={size} />
}

export function TourneyStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    published:   { bg: theme.colors.primary + '22', color: theme.colors.primary, label: 'Registration Open' },
    in_progress: { bg: theme.colors.hot + '22',     color: theme.colors.hot,     label: '● In Progress' },
    completed:   { bg: theme.colors.cool + '22',    color: theme.colors.cool,    label: 'Completed' },
    draft:       { bg: theme.colors.border,          color: theme.colors.subtext, label: 'Draft' },
    cancelled:   { bg: theme.colors.border,          color: theme.colors.subtext, label: 'Cancelled' },
  }
  const s = map[status] ?? { bg: theme.colors.border, color: theme.colors.subtext, label: status }
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: s.bg }}>
      <Text testID="tournament-status" style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: s.color, letterSpacing: 0.3 }}>{s.label}</Text>
    </View>
  )
}

export function HeroPill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: accent ? theme.colors.accent : 'rgba(255,255,255,0.1)', alignItems: 'center' }}>
      <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.lgs, color: accent ? theme.colors.accentInk : theme.colors.text, letterSpacing: -0.3 }}>{value}</Text>
      <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: accent ? theme.colors.accentInk : 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 }}>{label}</Text>
    </View>
  )
}

export function TeamSectionLabel({ title, count }: { title: string; count: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 4, paddingHorizontal: 2 }}>
      <Text style={ts.sectionTitle}>{title}</Text>
      <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: theme.colors.border }}>
        <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.subtext }}>{count}</Text>
      </View>
    </View>
  )
}

export function ScheduleSectionLabel({ title, count }: { title: string; count: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4, marginTop: 8, paddingHorizontal: 2 }}>
      <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.lgm, color: theme.colors.text, letterSpacing: -0.3 }}>{title}</Text>
      <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext }}>{count} matches</Text>
    </View>
  )
}

export function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: color + '22', borderWidth: 1, borderColor: color + '44' }}>
      <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color }}>{label}</Text>
    </View>
  )
}

/** Tinted organizer action ("Approve", "Mark Paid", "Remove"). */
export function OrgButton({ label, color, onPress, disabled }: { label: string; color: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: color + '18', borderWidth: 1, borderColor: color + '44', opacity: disabled ? 0.5 : 1 }}
    >
      <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm, color }}>{label}</Text>
    </TouchableOpacity>
  )
}

/** Compact Accept / Decline pair button used on invitations and join requests. */
export function MiniButton({ label, tone, onPress, disabled }: { label: string; tone: 'primary' | 'accept' | 'neutral'; onPress: () => void; disabled?: boolean }) {
  const bg = tone === 'primary' ? theme.colors.primary : tone === 'accept' ? theme.colors.cool + '22' : theme.colors.border
  const border = tone === 'accept' ? { borderWidth: 1, borderColor: theme.colors.cool + '55' } : null
  const color = tone === 'primary' ? theme.colors.onPrimary : tone === 'accept' ? theme.colors.cool : theme.colors.text
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[ts.miniButton, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }, border]}
    >
      <Text style={[ts.miniButtonLabel, { color }, tone !== 'neutral' && { fontWeight: '600' }]}>{label}</Text>
    </TouchableOpacity>
  )
}
