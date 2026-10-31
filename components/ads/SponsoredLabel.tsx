import { View } from 'react-native'
import { Text } from '../ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme } from '../../constants'
import { SPONSORED_LABEL } from '../../constants/ads'

/** The small "Sponsored" line above a sponsored event card (organic place or promoted slot). */
export function SponsoredLabel() {
  return (
    <View
      testID="sponsored-label"
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, marginBottom: theme.spacing.xs, paddingHorizontal: theme.spacing.xxs }}
    >
      <Ionicons name="megaphone-outline" size={12} color={theme.colors.subtext} />
      <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.subtext, letterSpacing: 0.6, textTransform: 'uppercase' }}>
        {SPONSORED_LABEL}
      </Text>
    </View>
  )
}
