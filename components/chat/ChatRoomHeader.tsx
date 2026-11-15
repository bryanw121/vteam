import { useRef } from 'react'
import { Image, TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../ui/Text'
import { shared, theme } from '../../constants'
import type { ChatRoomHeaderProps } from '../../types'
import type { ViewInstance } from 'react-native'

/**
 * The chat room's compact header (#318): back, the club's or player's picture and
 * name, and (DMs with another player) the options menu, anchored to its button.
 */
export function ChatRoomHeader({ title, avatarUri, isClub, onBack, onOpenMenu }: ChatRoomHeaderProps) {
  const insets = useSafeAreaInsets()
  const menuRef = useRef<ViewInstance>(null)
  return (
    <View style={[shared.chatRoomHeader, { paddingTop: insets.top + theme.spacing.sm }]}>
      <TouchableOpacity onPress={onBack} style={shared.chatRoomBack} accessibilityRole="button" accessibilityLabel="Back to chats">
        <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
      </TouchableOpacity>
      <View style={[shared.chatRoomAvatar, isClub && shared.chatRoomAvatarClub]}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={shared.chatRoomAvatarImage} accessibilityIgnoresInvertColors />
        ) : (
          <Ionicons name={isClub ? 'people' : 'person'} size={18} color={theme.colors.subtext} />
        )}
      </View>
      <Text style={shared.chatRoomTitle} numberOfLines={1} accessibilityRole="header">{title}</Text>
      {onOpenMenu ? (
        <View ref={menuRef} collapsable={false}>
          <TouchableOpacity
            onPress={() => menuRef.current?.measureInWindow((x, y, width, height) => onOpenMenu({ x, y, width, height }))}
            style={shared.chatRoomMenu}
            accessibilityRole="button"
            accessibilityLabel="Conversation options"
          >
            <Ionicons name="ellipsis-vertical" size={22} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  )
}
