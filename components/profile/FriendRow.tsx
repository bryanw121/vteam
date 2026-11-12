import { Image, Pressable, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import { profileAvatarSmallUri, profileDisplayName } from '../../utils'
import type { FriendRowProps } from '../../types'

const AVATAR = 44

/** Avatar, name and @username, with optional controls on the right. Tapping the row opens the profile. */
export function FriendRow({ profile, caption, onPress, children, footer, last, testID }: FriendRowProps) {
  const uri = profileAvatarSmallUri(profile?.avatar_url ?? null)
  return (
    <View
      testID={testID}
      style={{
        paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: theme.colors.border,
        gap: theme.spacing.sm,
      }}
    >
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, minHeight: 48 }}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'link' : undefined}
        style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, opacity: pressed ? 0.7 : 1 })}
      >
        <View style={{
          width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, overflow: 'hidden',
          backgroundColor: theme.colors.border, alignItems: 'center', justifyContent: 'center',
        }}>
          {uri ? <Image source={{ uri }} style={{ width: AVATAR, height: AVATAR }} /> : <Ionicons name="person" size={22} color={theme.colors.subtext} />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.text }}>
            {profile ? profileDisplayName(profile) : 'Unknown'}
          </Text>
          <Text numberOfLines={1} style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext }}>
            {caption ?? (profile?.username ? `@${profile.username}` : '')}
          </Text>
        </View>
      </Pressable>
      {children}
    </View>
    {footer ? <View style={{ paddingLeft: AVATAR + theme.spacing.md }}>{footer}</View> : null}
    </View>
  )
}
