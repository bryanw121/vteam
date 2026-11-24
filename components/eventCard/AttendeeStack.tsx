import React from 'react'
import { View } from 'react-native'
import { Image } from 'expo-image'
import { Text } from '../ui/Text'
import { shared } from '../../constants'
import { profileAvatarSmallUri, profileDisplayName } from '../../utils'
import type { EventCardModel, EventCardVariant } from '../../types'

type Props = { previews: EventCardModel['previews']; overflow: number; variant: EventCardVariant }

/** Up to three avatars (initials when there's no photo) and "+N" for the rest. */
export function AttendeeStack({ previews, overflow, variant }: Props) {
  if (previews.length === 0) return null
  const hero = variant === 'hero'
  return (
    <View style={shared.ecStack}>
      {previews.map((p, i) => {
        const uri = profileAvatarSmallUri(p.profiles?.avatar_url)
        const initial = p.profiles ? profileDisplayName(p.profiles).charAt(0).toUpperCase() : '?'
        return (
          <View key={p.user_id} style={[hero ? shared.ecAvatarHero : shared.ecAvatarRow, { marginLeft: i > 0 ? (hero ? -8 : -7) : 0 }]}>
            {uri
              ? <Image source={{ uri }} style={hero ? shared.ecAvatarImageHero : shared.ecAvatarImageRow} contentFit="cover" transition={150} />
              : <Text style={shared.ecAvatarInitial}>{initial}</Text>}
          </View>
        )
      })}
      {overflow > 0 && (
        <View style={hero ? shared.ecOverflowHero : shared.ecOverflowRow}>
          <Text style={hero ? shared.ecOverflowTextHero : shared.ecOverflowTextRow}>+{overflow}</Text>
        </View>
      )}
    </View>
  )
}
