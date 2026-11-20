import React from 'react'
import { TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../../ui/Text'
import { shared, theme } from '../../../constants'
import { profileDisplayName, hostRosterSkillAndPositionsLine } from '../../../utils'
import { hasRosterMenu } from '../../../utils/rosterActions'
import { guestFullName } from '../../../utils/guests'
import type { WaitlistListProps } from '../../../types/people'

/**
 * The waitlist (#332), in the order spots are offered: players first, then
 * +1s. Shown when someone is waiting, or to a viewer who can't get in because
 * the game is full. The host can promote a player.
 */
export function WaitlistList({ eventStatus, profiles, guests, onApprove, onRemoveGuest, menuButton, memberActions, guestActions }: WaitlistListProps) {
  const fullForMe = eventStatus.isFull && !eventStatus.isAttending && !eventStatus.isWaitlisted
  if (eventStatus.waitlistCount === 0 && guests.length === 0 && !fullForMe) return null
  return (
    <>
      <View style={shared.divider} />
      <View style={[shared.rowBetween, shared.mb_sm]}>
        <Text style={shared.subheading}>Waitlist</Text>
        <Text style={shared.caption}>{eventStatus.waitlistCount + guests.length} waiting</Text>
      </View>
      {profiles.length === 0 && guests.length === 0 ? (
        <Text style={shared.caption}>No one on the waitlist yet</Text>
      ) : (
        <View style={shared.peopleList}>
          {profiles.map((profile, idx) => {
            const name = profileDisplayName(profile)
            return (
              <View key={profile.id} style={[shared.card, shared.peopleListRow]}>
                <Text style={[shared.caption, shared.peopleListPlace]}>#{idx + 1}</Text>
                <View style={shared.peopleListMain}>
                  <Text style={shared.body}>{name}</Text>
                  {eventStatus.isOwner ? (
                    <Text style={[shared.caption, shared.peopleListDetail]} numberOfLines={2}>{hostRosterSkillAndPositionsLine(profile)}</Text>
                  ) : null}
                </View>
                {eventStatus.isOwner && (
                  <TouchableOpacity onPress={() => onApprove(profile.id)} style={shared.peopleApproveWaitlist}>
                    <Text style={shared.peopleActionText}>Approve</Text>
                  </TouchableOpacity>
                )}
                {menuButton(name, memberActions(profile))}
              </View>
            )
          })}
          {guests.map((g, idx) => {
            const name = guestFullName(g)
            const actions = guestActions(g)
            return (
              <View key={g.id} style={[shared.card, shared.peopleListRow]}>
                <Text style={[shared.caption, shared.peopleListPlace]}>#{profiles.length + idx + 1}</Text>
                <Text style={[shared.body, shared.peopleListGuestName]}>{name}</Text>
                <View style={shared.tag}><Text style={shared.tagText}>Guest</Text></View>
                {hasRosterMenu(actions) ? menuButton(name, actions) : eventStatus.isOwner ? (
                  <TouchableOpacity onPress={() => onRemoveGuest(g)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove guest ${name}`}>
                    <Ionicons name="close" size={16} color={theme.colors.subtext} />
                  </TouchableOpacity>
                ) : null}
              </View>
            )
          })}
        </View>
      )}
    </>
  )
}
