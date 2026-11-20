import React from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from '../../ui/Text'
import { Spinner } from '../../ui/Spinner'
import { shared, theme } from '../../../constants'
import { profileDisplayName, hostRosterSkillAndPositionsLine } from '../../../utils'
import { profilePrefetchProps } from '../../../hooks/useUserProfile'
import type { RequestListProps } from '../../../types/people'

/** Join requests on an approval-only game (#332): hosts and co-hosts approve or deny each. */
export function RequestList({ requested, attendance, onOpenProfile, onDeny, menuButton, memberActions }: RequestListProps) {
  if (requested.length === 0) return null
  const { processingRequest, approveRequest } = attendance
  return (
    <>
      <View style={shared.divider} />
      <View style={[shared.rowBetween, shared.mb_sm]}>
        <Text style={shared.subheading}>Requested</Text>
        <Text style={shared.caption}>{requested.length} pending</Text>
      </View>
      <View style={shared.peopleList}>
        {requested.map(profile => {
          const name = profileDisplayName(profile)
          const busy = processingRequest === profile.id
          return (
            <View key={profile.id} style={[shared.card, shared.peopleListRow]}>
              <TouchableOpacity style={shared.peopleListMain} onPress={() => onOpenProfile(profile.id)} {...profilePrefetchProps(profile.id)}>
                <Text style={shared.body}>{name}</Text>
                <Text style={[shared.caption, shared.peopleListDetail]} numberOfLines={2}>{hostRosterSkillAndPositionsLine(profile)}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => approveRequest(profile.id)} disabled={busy} style={shared.peopleApprove}>
                {busy ? <Spinner size="small" color={theme.colors.white} /> : <Text style={shared.peopleActionText}>Approve</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDeny(profile.id, name)} disabled={busy} style={shared.peopleDeny}>
                <Text style={shared.peopleDenyText}>Deny</Text>
              </TouchableOpacity>
              {menuButton(name, memberActions(profile))}
            </View>
          )
        })}
      </View>
    </>
  )
}
