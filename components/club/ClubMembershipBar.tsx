import { TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { Spinner } from '../ui/Spinner'
import { IconButton } from '../ui'
import { shared, theme } from '../../constants'
import type { ClubMembershipBarProps } from '../../types'

/** Join / Leave (or "Invite only"), and a member's new-game alerts bell (#170). Owners see only the bell. */
export function ClubMembershipBar({ club, owner, member, alertsOn, membershipBusy, alertsBusy, onJoin, onLeave, onToggleAlerts }: ClubMembershipBarProps) {
  return (
    <View style={shared.clubActionRow}>
      {owner ? (
        <Text style={[shared.caption, { flex: 1 }]}>{alertsOn ? 'New game alerts are on for this club' : 'New game alerts are off for this club'}</Text>
      ) : member ? (
        <TouchableOpacity onPress={onLeave} disabled={membershipBusy} style={[{ flex: 1 }, shared.buttonBase, shared.buttonSecondary, membershipBusy && shared.buttonDisabled]} accessibilityRole="button" testID="club-leave">
          {membershipBusy ? <Spinner color={theme.colors.primary} /> : <Text style={shared.buttonLabelSecondary}>Leave club</Text>}
        </TouchableOpacity>
      ) : club.membership_type === 'open' ? (
        <TouchableOpacity onPress={onJoin} disabled={membershipBusy} style={[{ flex: 1 }, shared.buttonBase, shared.buttonPrimary, membershipBusy && shared.buttonDisabled]} accessibilityRole="button" testID="club-join">
          {membershipBusy ? <Spinner color={theme.colors.white} /> : <Text style={shared.buttonLabelPrimary}>Join club</Text>}
        </TouchableOpacity>
      ) : (
        <View style={[{ flex: 1 }, shared.buttonBase, shared.clubInviteOnly]}>
          <Text style={shared.clubInviteOnlyLabel}>Invite only</Text>
        </View>
      )}
      {member ? (
        <IconButton
          icon={alertsOn ? 'notifications-outline' : 'notifications-off-outline'}
          label={alertsOn ? `Game alerts for ${club.name}: on. Turn off` : `Game alerts for ${club.name}: off. Turn on`}
          size={44}
          active={alertsOn}
          busy={alertsBusy}
          onPress={onToggleAlerts}
          testID="club-game-alerts"
        />
      ) : null}
    </View>
  )
}
