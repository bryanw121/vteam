import { TouchableOpacity, View } from 'react-native'
import { Link } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { shared, theme } from '../../constants'
import { routes } from '../../utils/routes'
import type { LiveScoresLinkProps } from '../../types'

/**
 * "Scores & brackets" strip under an outside tournament's card, for tournaments that run on the
 * Google Sheet app. Opens the scores inside vteam; the card above still links to the organizer.
 */
export function LiveScoresLink({ programId, title }: LiveScoresLinkProps) {
  return (
    <Link href={routes.programScores(programId)} asChild>
      <TouchableOpacity
        style={shared.programScoresLink}
        accessibilityRole="link"
        accessibilityLabel={`Scores and brackets for ${title}`}
        testID="program-scores-link"
      >
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.hot }} />
        <Text style={shared.programScoresLinkLabel}>Scores & brackets</Text>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.subtext} />
      </TouchableOpacity>
    </Link>
  )
}
