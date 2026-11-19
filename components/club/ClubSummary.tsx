import { Fragment } from 'react'
import { View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { shared, theme } from '../../constants'
import type { ClubSummaryProps } from '../../types'

/** Name, open / invite-only badge, metro and founding year, then members / upcoming / past counts. */
export function ClubSummary({ club, upcomingCount, pastCount }: ClubSummaryProps) {
  const open = club.membership_type === 'open'
  const tint = open ? theme.colors.success : theme.colors.subtext
  const members = club.club_members.length
  const stats: [number, string][] = [
    [members, members === 1 ? 'Member' : 'Members'],
    [upcomingCount, 'Upcoming'],
    [pastCount, 'Past'],
  ]
  return (
    <>
      <View style={shared.clubTitleBlock}>
        <Text style={shared.clubTitle}>{club.name}</Text>
        <View style={shared.clubMetaRow}>
          <View style={[shared.clubBadge, open ? shared.clubBadgeOpen : shared.clubBadgeClosed]}>
            <Ionicons name={open ? 'globe-outline' : 'lock-closed-outline'} size={11} color={tint} />
            <Text style={[shared.clubBadgeText, { color: tint }]}>{open ? 'Open' : 'Invite only'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="location-outline" size={12} color={theme.colors.subtext} />
            <Text style={shared.clubMetaText} numberOfLines={1}>{club.major_cities?.display_name ?? 'Unknown'}</Text>
          </View>
          <Text style={shared.clubMetaText}>· Est. {new Date(club.created_at).getFullYear()}</Text>
        </View>
      </View>

      <View style={[shared.card, shared.clubStatsRow]}>
        {stats.map(([n, label], i) => (
          <Fragment key={label}>
            {i > 0 && <View style={shared.clubStatDivider} />}
            <View style={shared.clubStatItem}>
              <Text style={shared.clubStatNumber}>{n}</Text>
              <Text style={shared.caption}>{label}</Text>
            </View>
          </Fragment>
        ))}
      </View>
    </>
  )
}
