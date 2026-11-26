import { TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme } from '../constants'
import { useShareLink } from './ShareLinkButton'
import type { ShareLinkInput } from '../types'

type Props = ShareLinkInput & { testID?: string }

/**
 * The share button on a card for a game run outside vteam (#395), laid over the card's
 * bottom-right corner as a sibling of the card's own button (never a button inside a button).
 * Shares a vteam link that opens the game's sheet, with one line saying what, where and when.
 */
export function OutsideShareButton({ testID, ...input }: Props) {
  const { share, copied } = useShareLink(input)
  return (
    <TouchableOpacity
      onPress={() => { void share() }}
      accessibilityRole="button"
      accessibilityLabel={copied ? 'Link copied' : `Share ${input.title}`}
      style={shared.outsideShare}
      testID={testID}
    >
      <Ionicons name={copied ? 'checkmark' : 'share-outline'} size={20} color={theme.colors.primaryText} />
    </TouchableOpacity>
  )
}
