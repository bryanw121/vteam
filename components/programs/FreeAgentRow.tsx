import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Text } from '../ui/Text'
import { IconButton } from '../ui'
import { Button } from '../Button'
import { ProfileAvatar } from '../ProfileAvatar'
import { shared, theme } from '../../constants'
import { normalizeVolleyballPositions, profileAvatarSmallUri, profileDisplayName, volleyballSkillLevelLabel } from '../../utils'
import { routes } from '../../utils/routes'
import { positionLabel, wantRowLabel } from '../../utils/freeAgents'
import type { FreeAgentRowProps } from '../../types'

/** One player on a Find a team list: who, what they play, what they want, and Message (#304). */
export function FreeAgentRow({ agent, mine, onMessage, onReport, onEdit, messaging }: FreeAgentRowProps) {
  const router = useRouter()
  const p = agent.profiles
  const name = p ? profileDisplayName(p) : 'Player'
  const tags = [
    ...normalizeVolleyballPositions(agent.positions).map(positionLabel),
    ...(p?.skill_level ? [`Level ${volleyballSkillLevelLabel(p.skill_level)}`] : []),
  ]
  return (
    <View style={shared.freeAgentRow} testID={`free-agent-${agent.user_id}`}>
      <Pressable onPress={() => p && router.push(routes.profileOf(p.id))} accessibilityRole="link" accessibilityLabel={`${name}'s profile`}>
        <ProfileAvatar uri={profileAvatarSmallUri(p?.avatar_url)} border={null} size={40} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0, gap: theme.spacing.xxs }}>
        <Text style={shared.freeAgentName} numberOfLines={1}>{name}{mine ? ' (you)' : ''}</Text>
        <View style={shared.freeAgentTags}>
          {tags.map(t => <Text key={t} style={shared.freeAgentTag}>{t}</Text>)}
          <Text style={shared.caption}>{wantRowLabel(agent.want)}</Text>
        </View>
        {agent.note ? <Text style={[shared.body, { color: theme.colors.subtextStrong }]}>{agent.note}</Text> : null}
      </View>
      {mine ? (
        <Button label="Edit" variant="secondary" size="touch" fullWidth={false} onPress={onEdit} testID="free-agent-edit" />
      ) : (
        <View style={{ alignItems: 'flex-end', gap: theme.spacing.xs }}>
          <Button label="Message" variant="secondary" size="touch" fullWidth={false} loading={messaging} onPress={onMessage} accessibilityLabel={`Message ${name}`} testID={`free-agent-message-${agent.user_id}`} />
          <IconButton icon="flag-outline" label={`Report ${name}`} onPress={onReport} testID={`free-agent-report-${agent.user_id}`} />
        </View>
      )}
    </View>
  )
}
