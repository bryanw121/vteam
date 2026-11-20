import React from 'react'
import { View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { Button } from '../Button'
import { shared, theme } from '../../constants'
import { publicViewCopy } from '../../constants/tournamentCopy'

type Props = {
  clubName: string | null
  isGuest: boolean
  /** Guests: sign in. Signed-in players outside the club: open the club. */
  onAction: () => void
}

/** Strip under the tabs when the page is the public, read-only copy (#282). */
export function PublicViewNote({ clubName, isGuest, onAction }: Props) {
  const copy = publicViewCopy(clubName, isGuest)
  return (
    <View style={shared.tournamentPublicNote} testID="tournament-public-note">
      <Ionicons name="eye-outline" size={18} color={theme.colors.primaryText} />
      <Text style={shared.tournamentPublicNoteText}>{copy.body}</Text>
      <Button label={copy.action} size="touch" variant="secondary" fullWidth={false} onPress={onAction} testID="tournament-public-action" />
    </View>
  )
}
