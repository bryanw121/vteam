import { useState } from 'react'
import { View } from 'react-native'
import { Button } from '../Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { FriendManageSheet } from './FriendManageSheet'
import { FRIEND_COPY, GENERIC_ERROR_MESSAGE } from '../../constants'
import { useSession } from '../../contexts/session'
import { useRequireSignIn } from '../../hooks/useRequireSignIn'
import { useFriendActions, useFriends, type FriendAction } from '../../hooks/useFriends'
import { friendErrorMessage, friendStatusOf } from '../../utils/friends'
import { profileDisplayName } from '../../utils'
import type { FriendButtonProps } from '../../types'

/**
 * Add friend / Requested / Accept + Decline / Friends, for another player's
 * profile (#15). Guests see "Add friend", which asks them to sign in.
 */
export function FriendButton({ userId, profile, onMessage }: FriendButtonProps) {
  const { userId: me, isGuest } = useSession()
  const requireSignIn = useRequireSignIn()
  const { data, hasData } = useFriends()
  const { run, isPending } = useFriendActions()
  const [confirm, setConfirm] = useState<'cancel' | 'remove' | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [removeAfterSheet, setRemoveAfterSheet] = useState(false)

  if (me === userId) return null

  const status = friendStatusOf(data, userId)
  const friend = data.friends.find(f => f.friend_id === userId)
  const incoming = data.incoming.find(r => r.requester_id === userId)
  const bestCount = data.friends.filter(f => f.is_best_friend).length
  const name = profile ? profileDisplayName(profile) : 'Friend'

  async function act(action: FriendAction, success?: string) {
    const error = await run(action)
    if (error) onMessage?.(friendErrorMessage(error) ?? GENERIC_ERROR_MESSAGE, 'error')
    else if (success) onMessage?.(success, 'success')
  }

  if (isGuest) {
    return (
      <Button label={FRIEND_COPY.add} icon="person-add-outline" size="touch" onPress={() => { requireSignIn() }} testID="friend-button-add" />
    )
  }
  if (!hasData) {
    return <Button label={FRIEND_COPY.add} icon="person-add-outline" size="touch" onPress={() => {}} loading disabled testID="friend-button-loading" />
  }

  return (
    <>
      {status === 'none' && (
        <Button
          label={FRIEND_COPY.add}
          icon="person-add-outline"
          size="touch"
          loading={isPending}
          onPress={() => void act({ kind: 'send', userId, profile }, 'Friend request sent')}
          testID="friend-button-add"
        />
      )}
      {status === 'requested' && (
        <Button
          label={FRIEND_COPY.requested}
          icon="time-outline"
          variant="secondary"
          size="touch"
          onPress={() => setConfirm('cancel')}
          accessibilityLabel="Friend request sent. Tap to cancel it."
          testID="friend-button-requested"
        />
      )}
      {status === 'incoming' && incoming && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button
              label={FRIEND_COPY.accept}
              icon="checkmark"
              size="touch"
              loading={isPending}
              onPress={() => void act({ kind: 'respond', requestId: incoming.id, accept: true }, `You and ${name} are now friends`)}
              testID="friend-button-accept"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={FRIEND_COPY.decline}
              variant="secondary"
              size="touch"
              disabled={isPending}
              onPress={() => void act({ kind: 'respond', requestId: incoming.id, accept: false })}
              testID="friend-button-decline"
            />
          </View>
        </View>
      )}
      {status === 'friends' && (
        <Button
          label={friend?.is_best_friend ? FRIEND_COPY.bestFriend : FRIEND_COPY.friends}
          icon={friend?.is_best_friend ? 'star' : 'people'}
          variant="secondary"
          size="touch"
          onPress={() => setSheetOpen(true)}
          accessibilityLabel={`${friend?.is_best_friend ? FRIEND_COPY.bestFriend : FRIEND_COPY.friends}. Tap for options.`}
          testID="friend-button-friends"
        />
      )}

      <FriendManageSheet
        visible={sheetOpen}
        name={name}
        isBestFriend={!!friend?.is_best_friend}
        bestFriendCount={bestCount}
        onToggleBest={best => void act({ kind: 'best', userId, best })}
        onRemove={() => { setRemoveAfterSheet(true); setSheetOpen(false) }}
        onDismiss={() => setSheetOpen(false)}
        onClosed={() => {
          // iOS can't present the confirm until the sheet's Modal has gone.
          if (removeAfterSheet) { setRemoveAfterSheet(false); setConfirm('remove') }
        }}
      />
      <ConfirmDialog
        visible={confirm !== null}
        title={confirm === 'remove' ? FRIEND_COPY.removeTitle : FRIEND_COPY.cancelTitle}
        body={confirm === 'remove' ? FRIEND_COPY.removeBody : FRIEND_COPY.cancelBody}
        confirmLabel={confirm === 'remove' ? FRIEND_COPY.removeConfirm : FRIEND_COPY.cancelConfirm}
        cancelLabel="Keep"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const kind = confirm
          setConfirm(null)
          if (kind === 'remove') void act({ kind: 'remove', userId })
          else if (kind === 'cancel') void act({ kind: 'cancel', userId })
        }}
      />
    </>
  )
}
