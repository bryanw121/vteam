import { Pressable, Switch, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { BottomSheet } from '../ui/BottomSheet'
import { BEST_FRIEND_LIMIT, FRIEND_COPY, theme } from '../../constants'
import type { FriendManageSheetProps } from '../../types'

/** Options for an existing friend: the private best-friend flag, and Remove friend. */
export function FriendManageSheet({
  visible, name, isBestFriend, bestFriendCount, onToggleBest, onRemove, onDismiss, onClosed,
}: FriendManageSheetProps) {
  const atLimit = !isBestFriend && bestFriendCount >= BEST_FRIEND_LIMIT
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} onClosed={onClosed} title={name}>
      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, minHeight: 52 }}>
          <Ionicons name={isBestFriend ? 'star' : 'star-outline'} size={20} color={theme.colors.medalGold} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.text }}>
              {FRIEND_COPY.bestFriend}
            </Text>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext }}>
              {atLimit ? FRIEND_COPY.bestFriendLimit : `${FRIEND_COPY.bestFriendHint} ${bestFriendCount}/${BEST_FRIEND_LIMIT}`}
            </Text>
          </View>
          <Switch
            value={isBestFriend}
            disabled={atLimit}
            onValueChange={onToggleBest}
            accessibilityLabel={FRIEND_COPY.bestFriend}
            testID="friend-best-toggle"
            trackColor={{ false: theme.colors.border, true: theme.colors.primary + '99' }}
            thumbColor={isBestFriend ? theme.colors.white : theme.colors.card}
            ios_backgroundColor={theme.colors.border}
          />
        </View>
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          testID="friend-remove"
          style={({ pressed }) => ({
            minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
            borderTopWidth: 1, borderTopColor: theme.colors.border, opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons name="person-remove-outline" size={20} color={theme.colors.error} />
          <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.error }}>
            Remove friend
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  )
}
