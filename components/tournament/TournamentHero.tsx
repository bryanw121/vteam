import React from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { theme } from '../../constants'
import { FORMAT_LABELS } from '../../constants/tournamentCopy'
import { SKILL_LEVEL_LABELS } from '../../constants/copy'
import type { Tournament } from '../../types'
import { HeroPill, TourneyStatusBadge } from './TournamentBits'

function timeAgoOrCountdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'Started'
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

type Props = {
  tournament: Tournament
  registeredTeamCount: number
  onBack: () => void
}

/** Title block at the top of the tournament page: status, format, title, place/date, countdowns. */
export function TournamentHero({ tournament, registeredTeamCount, onBack }: Props) {
  const insets = useSafeAreaInsets()
  return (
    <View style={{ backgroundColor: theme.colors.card, overflow: 'hidden' }}>
      {/* Diagonal court stripe motif */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <View key={i} style={{
            position: 'absolute',
            left: -60 + i * 28,
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: 'rgba(255,255,255,0.04)',
            transform: [{ rotate: '-20deg' }, { scaleY: 3 }],
          }} />
        ))}
      </View>

      {/* Trophy watermark */}
      <Text style={{
        position: 'absolute', right: -4, bottom: -10,
        fontSize: theme.font.watermark.md, opacity: 0.07,
      }} selectable={false}>🏆</Text>

      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 16, position: 'relative' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <TouchableOpacity
            onPress={onBack}
            hitSlop={8}
            accessibilityLabel="Back"
            style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
          </TouchableOpacity>
          <TourneyStatusBadge status={tournament.status} />
        </View>

        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)' }}>
            <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: 'rgba(255,255,255,0.75)', letterSpacing: 0.3 }}>
              {FORMAT_LABELS[tournament.format] ?? tournament.format}
            </Text>
          </View>
        </View>

        <Text accessibilityRole="header" style={{ fontFamily: theme.fonts.display, fontSize: theme.font.heading.lg, letterSpacing: -0.8, lineHeight: 30, color: theme.colors.text, marginBottom: 8 }}>
          {tournament.title}
        </Text>

        <View style={{ flexDirection: 'row', gap: 14, marginBottom: 14 }}>
          {!!tournament.location && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.5)" />
              <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: 'rgba(255,255,255,0.6)' }}>{tournament.location}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.5)" />
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: 'rgba(255,255,255,0.6)' }}>
              {new Date(tournament.start_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <HeroPill label="Starts" value={timeAgoOrCountdown(tournament.start_date)} />
          {!!tournament.registration_deadline && (
            <HeroPill label="Reg. closes" value={timeAgoOrCountdown(tournament.registration_deadline)} />
          )}
          {!!tournament.max_teams && (
            <HeroPill label="Teams" value={`${registeredTeamCount}/${tournament.max_teams}`} accent />
          )}
        </View>

        {(tournament.skill_levels ?? []).length > 0 && (
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {(tournament.skill_levels ?? []).map(s => (
              <View key={s} style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: theme.colors.primary + '30' }}>
                <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.primary }}>{SKILL_LEVEL_LABELS[s] ?? s}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  )
}
