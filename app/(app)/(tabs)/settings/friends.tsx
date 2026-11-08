import React, { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Text } from '../../../../components/ui/Text'
import { RefreshControl } from '../../../../components/RefreshControl'
import { Button } from '../../../../components/Button'
import { IconButton, ScreenState } from '../../../../components/ui'
import { FriendRow } from '../../../../components/profile/FriendRow'
import { Toast } from '../../../../components/Toast'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { useFriendActions, useFriends, type FriendAction } from '../../../../hooks/useFriends'
import { useSilencedUsers } from '../../../../hooks/useSilencedUsers'
import { useFocusRefetch } from '../../../../lib/query'
import { BEST_FRIEND_LIMIT, FRIEND_COPY, GENERIC_ERROR_MESSAGE, shared, theme } from '../../../../constants'
import { friendErrorMessage, sortFriends, visibleIncoming } from '../../../../utils/friends'
import { routes } from '../../../../utils/routes'

/** Settings → Friends (#15): incoming requests, requests I sent, and my friends (best friends first). */
export default function FriendsScreen() {
  useStackBackTitle('Friends')
  const router = useRouter()
  const { data, hasData, isLoading, error, refetch, key } = useFriends()
  useFocusRefetch(key)
  const { run, isPending } = useFriendActions()
  const { silencedUserIds } = useSilencedUsers()
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState<{ message: string; variant: 'error' | 'success' | 'info' } | null>(null)

  const incoming = visibleIncoming(data.incoming, silencedUserIds)
  const friends = sortFriends(data.friends)
  const bestCount = data.friends.filter(f => f.is_best_friend).length

  async function act(action: FriendAction, success?: string) {
    const err = await run(action)
    if (err) setToast({ message: friendErrorMessage(err) ?? GENERIC_ERROR_MESSAGE, variant: 'error' })
    else if (success) setToast({ message: success, variant: 'success' })
  }

  async function onRefresh() {
    setRefreshing(true)
    try { await refetch({ force: true }) } finally { setRefreshing(false) }
  }

  const sectionTitle = (label: string) => (
    <Text style={shared.subpageSectionTitle} accessibilityRole="header">{label}</Text>
  )

  return (
    <View style={shared.screen}>
      <ScreenState
        loading={isLoading}
        ready={hasData}
        error={error && !hasData ? "Couldn't load your friends." : null}
        onRetry={() => void refetch({ force: true })}
      >
        <ScrollView
          contentContainerStyle={[shared.scrollContentSubpage, { paddingBottom: 32 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.colors.primary} />}
          testID="friends-screen"
        >
          {incoming.length > 0 && (
            <>
              {sectionTitle(`Requests (${incoming.length})`)}
              <View style={[shared.card, { padding: 0, overflow: 'hidden' }]} testID="friends-incoming">
                {incoming.map((r, i) => (
                  <FriendRow
                    key={r.id}
                    profile={r.other}
                    caption="Wants to be friends"
                    onPress={() => router.push(routes.profileOf(r.requester_id))}
                    last={i === incoming.length - 1}
                    testID="friend-request-row"
                    footer={
                      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                        <View style={{ flex: 1 }}>
                          <Button
                            label={FRIEND_COPY.accept}
                            icon="checkmark"
                            size="touch"
                            disabled={isPending}
                            onPress={() => void act({ kind: 'respond', requestId: r.id, accept: true }, 'Friend added')}
                            testID="friend-request-accept"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Button
                            label={FRIEND_COPY.decline}
                            variant="secondary"
                            size="touch"
                            disabled={isPending}
                            onPress={() => void act({ kind: 'respond', requestId: r.id, accept: false })}
                            testID="friend-request-decline"
                          />
                        </View>
                      </View>
                    }
                  />
                ))}
              </View>
            </>
          )}

          {sectionTitle(`Friends${friends.length ? ` (${friends.length})` : ''}`)}
          {friends.length === 0 ? (
            <View style={[shared.card, { alignItems: 'center', gap: theme.spacing.xs, paddingVertical: theme.spacing.xl }]}>
              <Text style={[shared.body, { textAlign: 'center' }]}>No friends yet</Text>
              <Text style={[shared.caption, { textAlign: 'center' }]}>
                Open a player's profile and tap {FRIEND_COPY.add}. You'll see which friends are going to each event.
              </Text>
            </View>
          ) : (
            <>
              <Text style={[shared.caption, { marginBottom: theme.spacing.sm }]}>
                Star up to {BEST_FRIEND_LIMIT} best friends ({bestCount}/{BEST_FRIEND_LIMIT}). {FRIEND_COPY.bestFriendHint}
              </Text>
              <View style={[shared.card, { padding: 0, overflow: 'hidden' }]} testID="friends-list">
                {friends.map((f, i) => {
                  const atLimit = !f.is_best_friend && bestCount >= BEST_FRIEND_LIMIT
                  return (
                    <FriendRow
                      key={f.friend_id}
                      profile={f.profile}
                      onPress={() => router.push(routes.profileOf(f.friend_id))}
                      last={i === friends.length - 1}
                      testID="friend-row"
                    >
                      <IconButton
                        icon={f.is_best_friend ? 'star' : 'star-outline'}
                        size={44}
                        active={f.is_best_friend}
                        label={f.is_best_friend ? 'Remove from best friends' : 'Mark as best friend'}
                        onPress={() => {
                          if (atLimit) setToast({ message: FRIEND_COPY.bestFriendLimit, variant: 'info' })
                          else void act({ kind: 'best', userId: f.friend_id, best: !f.is_best_friend })
                        }}
                        testID="friend-best-star"
                      />
                    </FriendRow>
                  )
                })}
              </View>
            </>
          )}

          {data.outgoing.length > 0 && (
            <>
              {sectionTitle('Sent')}
              <View style={[shared.card, { padding: 0, overflow: 'hidden' }]} testID="friends-outgoing">
                {data.outgoing.map((r, i) => (
                  <FriendRow
                    key={r.id}
                    profile={r.other}
                    caption={FRIEND_COPY.requested}
                    onPress={() => router.push(routes.profileOf(r.addressee_id))}
                    last={i === data.outgoing.length - 1}
                  >
                    <Button
                      label="Cancel"
                      variant="ghost"
                      size="touch"
                      fullWidth={false}
                      disabled={isPending}
                      onPress={() => void act({ kind: 'cancel', userId: r.addressee_id })}
                      testID="friend-request-cancel"
                    />
                  </FriendRow>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </ScreenState>
      <Toast message={toast?.message ?? ''} variant={toast?.variant ?? 'info'} visible={!!toast} onHide={() => setToast(null)} />
    </View>
  )
}
