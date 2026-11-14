import { TouchableOpacity, View } from 'react-native'
import { Link } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { shared, theme } from '../../constants'
import { routes } from '../../utils/routes'
import { freeAgentStripText } from '../../utils/freeAgents'
import type { FreeAgentStripProps } from '../../types'

/**
 * "Find a team" strip under an outside tournament or league card (#304). Opens the program's
 * list in vteam; the card above still links to the organizer's sign-up.
 */
export function FreeAgentStrip({ program, count }: FreeAgentStripProps) {
  const line = freeAgentStripText(count)
  return (
    <Link href={routes.findATeam(program.id)} asChild>
      <TouchableOpacity
        style={shared.programScoresLink}
        accessibilityRole="link"
        accessibilityLabel={`Find a team for ${program.title}. ${line}`}
        testID="program-find-a-team"
      >
        <Ionicons name={count ? 'people' : 'hand-right-outline'} size={16} color={count ? theme.colors.cool : theme.colors.subtext} />
        <Text style={shared.programScoresLinkLabel} numberOfLines={1}>{line}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={shared.programFreeAgentLink}>Find a team</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.primaryText} />
        </View>
      </TouchableOpacity>
    </Link>
  )
}
