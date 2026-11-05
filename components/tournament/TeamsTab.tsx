import React from 'react'
import { ScrollView, View } from 'react-native'
import { Text } from '../ui/Text'
import type { RefreshControlProps } from 'react-native'
import { theme } from '../../constants'
import { SKILL_LEVEL_LABELS } from '../../constants/copy'
import { profileDisplayName } from '../../utils'
import { Button } from '../Button'
import type { TournamentTeam, TournamentTeamWithRoster } from '../../types'
import type { TournamentJoinRequestWithRequester } from '../../types'
import { TeamCard } from './TeamCard'
import type { TeamCardActions } from '../../types'
import { MiniButton, TeamSectionLabel } from './TournamentBits'
import { ts } from './tournamentStyles'

type Props = {
  /** Pull-to-refresh for the whole tournament page. */
  refreshControl?: React.ReactElement<RefreshControlProps>
  teams: TournamentTeamWithRoster[]
  myTeam: TournamentTeam | null
  viewerId: string | null
  isCreator: boolean
  registrationOpen: boolean
  joinRequests: TournamentJoinRequestWithRequester[]
  actions: TeamCardActions
  /** Organizer: open the seeding sheet. */
  onSetSeeds: () => void
}

export function TeamsTab({ teams, myTeam, viewerId, isCreator, registrationOpen, joinRequests, actions, refreshControl, onSetSeeds }: Props) {
  const approved = teams.filter(t => t.status === 'registered' && t.is_approved)
  const pending = teams.filter(t => t.status === 'registered' && !t.is_approved)
  const freeAgents = teams.filter(t => t.status === 'free_agent')
  const waitlisted = teams.filter(t => t.status === 'waitlisted')

  const card = (t: TournamentTeamWithRoster) => (
    <TeamCard
      key={t.id}
      team={t}
      isOrganizer={isCreator}
      viewerId={viewerId}
      myTeam={myTeam}
      registrationOpen={registrationOpen}
      joinRequests={joinRequests}
      actions={actions}
    />
  )

  return (
    <ScrollView contentContainerStyle={ts.scrollContent} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
      {/* Captain action strip */}
      {myTeam && myTeam.captain_user_id === viewerId && (
        <View style={{ marginBottom: 14 }}>
          <Button label="Invite Players" icon="person-add-outline" onPress={actions.onInvite} />
        </View>
      )}

      {isCreator && approved.length + pending.length >= 2 && (
        <View style={{ marginBottom: 14 }}>
          <Button label="Set seeds" icon="podium-outline" variant="secondary" onPress={onSetSeeds} testID="set-seeds" />
        </View>
      )}

      {approved.length > 0 && <TeamSectionLabel title="Registered" count={approved.length} />}
      {approved.map(card)}

      {pending.length > 0 && <TeamSectionLabel title="Pending Approval" count={pending.length} />}
      {pending.map(card)}

      {waitlisted.length > 0 && <TeamSectionLabel title="Waitlist" count={waitlisted.length} />}
      {waitlisted.map(card)}

      {freeAgents.length > 0 && <TeamSectionLabel title="Free Agents" count={freeAgents.length} />}
      {freeAgents.map(card)}

      {teams.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 56 }}>
          <Text style={{ fontSize: theme.font.emoji.xxl, marginBottom: 10 }}>🏐</Text>
          <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.base, color: theme.colors.subtext }}>No teams yet</Text>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.subtext, marginTop: 4 }}>Be the first to register.</Text>
        </View>
      )}

      {/* Organizer: join requests across all teams */}
      {isCreator && joinRequests.length > 0 && (
        <View style={[ts.card, { marginTop: 8, marginBottom: 0 }]}>
          <Text style={[ts.sectionTitle, { marginBottom: 10 }]}>All Join Requests</Text>
          {joinRequests.map(req => (
            <View key={req.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.smd, color: theme.colors.text }}>{req.requester ? profileDisplayName(req.requester) : 'Unknown'}</Text>
                <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext }}>
                  {req.requester?.skill_level ? SKILL_LEVEL_LABELS[req.requester.skill_level] ?? req.requester.skill_level : ''} → {teams.find(t => t.id === req.team_id)?.name ?? '?'}
                </Text>
              </View>
              <MiniButton label="Approve" tone="accept" onPress={() => actions.onApproveRequest(req)} />
              <MiniButton label="Decline" tone="neutral" onPress={() => actions.onDeclineRequest(req.id)} />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  )
}
