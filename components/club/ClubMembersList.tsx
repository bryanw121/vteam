import { View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { EventCard } from '../EventCard'
import { shared, theme } from '../../constants'
import { profileDisplayName } from '../../utils'
import type { ClubEventsProps, ClubMembersListProps } from '../../types'

/** The club's upcoming events, or an empty card. */
export function ClubEvents({ events }: ClubEventsProps) {
  return (
    <>
      <View style={shared.clubSectionHeader}>
        <Text style={shared.subheading}>Upcoming Events</Text>
      </View>
      {events.length === 0 ? (
        <View style={[shared.card, shared.clubEmptyCard]}>
          <Ionicons name="calendar-outline" size={28} color={theme.colors.subtext} />
          <Text style={shared.caption}>No upcoming events</Text>
        </View>
      ) : (
        <View style={{ marginBottom: theme.spacing.md }}>
          {events.map(event => <EventCard key={event.id} event={event} />)}
        </View>
      )}
    </>
  )
}

/** "Members (N)": one row per member, owners badged. */
export function ClubMembersList({ members }: ClubMembersListProps) {
  return (
    <>
      <View style={shared.clubSectionHeader}>
        <Text style={shared.subheading}>Members ({members.length})</Text>
      </View>
      <View style={[shared.card, { paddingVertical: 0, paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.xl }]}>
        {members.length === 0 ? (
          <View style={{ paddingVertical: theme.spacing.md, alignItems: 'center' }}>
            <Text style={shared.caption}>No members yet</Text>
          </View>
        ) : (
          members.map(m => {
            const name = m.profiles ? profileDisplayName(m.profiles) : 'Unknown'
            return (
              <View key={m.user_id} style={shared.clubMemberRow}>
                <View style={shared.clubMemberInitial}>
                  <Text style={shared.clubMemberInitialText}>{name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={[shared.body, { flex: 1 }]} numberOfLines={1}>{name}</Text>
                {m.role === 'owner' && (
                  <View style={shared.clubOwnerBadge}>
                    <Text style={shared.clubOwnerBadgeText}>Owner</Text>
                  </View>
                )}
              </View>
            )
          })
        )}
      </View>
    </>
  )
}
