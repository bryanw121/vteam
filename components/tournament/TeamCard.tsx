import React from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme } from '../../constants'
import { SKILL_LEVEL_LABELS } from '../../constants/copy'
import { profileDisplayName } from '../../utils'
import type { TeamCardActions, TournamentJoinRequestWithRequester, TournamentTeam, TournamentTeamWithRoster } from '../../types'
import { AutoAvatar, MiniButton, OrgButton, StatusPill } from './TournamentBits'
import { ts } from './tournamentStyles'

type Props = {
  team: TournamentTeamWithRoster
  /** The viewer is the tournament organizer. */
  isOrganizer: boolean
  viewerId: string | null
  /** The viewer's own team in this tournament, if any. */
  myTeam: TournamentTeam | null
  registrationOpen: boolean
  /** Pending join requests (only shown on the viewer's own team). */
  joinRequests: TournamentJoinRequestWithRequester[]
  actions: TeamCardActions
}

export function TeamCard({ team, isOrganizer, viewerId, myTeam, registrationOpen, joinRequests, actions }: Props) {
  const isMyTeam = myTeam?.id === team.id
  const isFreeAgent = team.status === 'free_agent'
  const isMyCaptain = isMyTeam && !isOrganizer && myTeam?.captain_user_id === viewerId
  const myRequests = isMyTeam ? joinRequests.filter(r => r.team_id === team.id) : []

  return (
    <View style={{
      backgroundColor: isMyTeam ? theme.colors.primarySoft : theme.colors.card,
      borderRadius: 18, padding: 14, marginBottom: 10,
      borderWidth: isMyTeam ? 1.5 : 1,
      borderColor: isMyTeam ? theme.colors.primary : theme.colors.border,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 5 }}>
            <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.lgs, color: theme.colors.text, letterSpacing: -0.2 }}>{team.name}</Text>
            {team.seed !== null && !isFreeAgent && <StatusPill label={`Seed ${team.seed}`} color={theme.colors.accent} />}
            {isMyTeam && <StatusPill label="You" color={theme.colors.primary} />}
            {isFreeAgent && <StatusPill label="Free Agent" color={theme.colors.subtext} />}
            {team.is_paid && <StatusPill label="Paid" color={theme.colors.cool} />}
            {!team.is_approved && !isFreeAgent && <StatusPill label="Pending" color={theme.colors.warm} />}
          </View>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext }}>
            {team.members.length} player{team.members.length !== 1 ? 's' : ''}
          </Text>
        </View>

        {isMyCaptain && (
          <TouchableOpacity
            onPress={actions.onInvite}
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.background }}
          >
            <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm, color: theme.colors.text }}>+ Invite</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Roster list */}
      {team.members.map(m => {
        const p = m.profiles
        const skillLabel = p?.skill_level ? SKILL_LEVEL_LABELS[p.skill_level] ?? p.skill_level : null
        return (
          <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5, borderTopWidth: 1, borderTopColor: theme.colors.borderSoft }}>
            <AutoAvatar avatarUrl={p?.avatar_url} size={30} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: m.is_captain ? theme.fonts.bodySemiBold : theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.text }}>
                {p ? profileDisplayName(p) : 'Player'}{m.is_captain ? ' · C' : ''}
              </Text>
              {skillLabel && (
                <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext }}>{skillLabel}</Text>
              )}
            </View>
            {isOrganizer && (
              <TouchableOpacity
                hitSlop={8}
                accessibilityLabel="Move player to another team"
                onPress={() => actions.onMovePlayer({ userId: m.user_id, fromTeamId: team.id, playerName: p ? profileDisplayName(p) : 'Player' })}
              >
                <Ionicons name="swap-horizontal-outline" size={15} color={theme.colors.subtext} />
              </TouchableOpacity>
            )}
          </View>
        )
      })}

      {/* Organizer actions */}
      {isOrganizer && !isFreeAgent && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {!team.is_approved && <OrgButton label="Approve" color={theme.colors.primary} onPress={() => actions.onApprove(team.id)} />}
          {!team.is_paid && <OrgButton label="Mark Paid" color={theme.colors.cool} onPress={() => actions.onMarkPaid(team.id)} />}
          <OrgButton label="Remove" color={theme.colors.error} onPress={() => actions.onRemove(team.id, team.name)} />
        </View>
      )}

      {/* Organizer: assign free agent */}
      {isOrganizer && isFreeAgent && (
        <TouchableOpacity
          onPress={() => actions.onAssign(team)}
          style={{ marginTop: 10, paddingVertical: 9, borderRadius: 10, backgroundColor: theme.colors.primary + '18', alignItems: 'center' }}
        >
          <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.smd, color: theme.colors.primary }}>Assign to Team →</Text>
        </TouchableOpacity>
      )}

      {/* Player: request to join */}
      {!isOrganizer && !isMyTeam && !isFreeAgent && registrationOpen && !myTeam && (
        <TouchableOpacity
          onPress={() => actions.onRequestJoin(team)}
          style={{ marginTop: 10, paddingVertical: 9, borderRadius: 10, backgroundColor: theme.colors.border, alignItems: 'center' }}
        >
          <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.smd, color: theme.colors.text }}>Request to Join</Text>
        </TouchableOpacity>
      )}

      {/* Captain: join requests on my team */}
      {myRequests.length > 0 && (
        <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          <Text style={[ts.sectionTitle, { marginBottom: 8 }]}>Join Requests</Text>
          {myRequests.map(req => (
            <View key={req.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.smd, color: theme.colors.text }}>{req.requester ? profileDisplayName(req.requester) : 'Unknown'}</Text>
                {req.requester?.skill_level && <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext }}>{SKILL_LEVEL_LABELS[req.requester.skill_level] ?? req.requester.skill_level}</Text>}
              </View>
              <MiniButton label="Accept" tone="accept" onPress={() => actions.onApproveRequest(req)} />
              <MiniButton label="Decline" tone="neutral" onPress={() => actions.onDeclineRequest(req.id)} />
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
