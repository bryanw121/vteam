import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, KeyboardAvoidingView, Platform } from 'react-native'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import type { TextInputInstance } from 'react-native'
import { ReportSheet } from '../../../components/ReportSheet'
import { theme } from '../../../constants'
import { useSession } from '../../../contexts/session'
import { useMessages } from '../../../hooks/useMessages'
import { useConversationRow } from '../../../hooks/useConversations'
import { useSilencedUsers } from '../../../hooks/useSilencedUsers'
import { useChatComposer } from '../../../hooks/chat/useChatComposer'
import { useClubMentionables } from '../../../hooks/chat/useClubMentionables'
import { useBadWordPrompt } from '../../../hooks/chat/useBadWordPrompt'
import { AnchorOptionsMenu } from '../../../components/AnchorOptionsMenu'
import { MessageBubble } from '../../../components/MessageBubble'
import { ChatMessageList } from '../../../components/ChatMessageList'
import { ReactionPicker } from '../../../components/ReactionPicker'
import { ChatRoomHeader } from '../../../components/chat/ChatRoomHeader'
import { ChatComposer } from '../../../components/chat/ChatComposer'
import { ImageViewer } from '../../../components/chat/ImageViewer'
import { ConfirmDialog, ScreenState } from '../../../components/ui'
import type { AnchorRect, MessageWithDetails } from '../../../types'
import { profileAvatarSmallUri, confirmDestructive } from '../../../utils'
import { chatPeerName } from '../../../utils/chatComposer'
import { routes } from '../../../utils/routes'

/**
 * One conversation (#318: in pieces). The composer, @mentions and the bad-word
 * prompt live in hooks/chat/*; the header and composer in components/chat/*.
 */
export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const inputRef = useRef<TextInputInstance>(null)
  const { userId: myId } = useSession()
  // Header data comes from the shared conversations store (no request once the list has loaded).
  const { row: convRow, refresh: refreshConvRow } = useConversationRow(id)
  const isClub = convRow?.type === 'club'
  const isDm = convRow?.type === 'dm'

  const {
    messages, loading, error: messagesError, hasMore, loadMore, refresh,
    sendMessage, retryMessage, deleteMessage, editMessage, toggleReaction, uploadImage,
  } = useMessages(id)
  const { silencedUserIds, silenceUser } = useSilencedUsers()
  const mentionableUsers = useClubMentionables(isClub ? convRow?.club_id : null, myId)
  const composer = useChatComposer({ inputRef, mentionableUsers, sendMessage, editMessage, uploadImage })
  const badWord = useBadWordPrompt({ conversationId: id, isDm, myId, messages, loading })

  const [listRefreshing, setListRefreshing] = useState(false)
  const [picker, setPicker] = useState<{ message: MessageWithDetails; pos: { x: number; y: number } } | null>(null)
  const focusInputAfterPickerRef = useRef(false)
  const [viewingImage, setViewingImage] = useState<string | null>(null)
  const [headerMenuAnchor, setHeaderMenuAnchor] = useState<AnchorRect | null>(null)
  const [reportOpen, setReportOpen] = useState(false)

  useEffect(() => { setHeaderMenuAnchor(null) }, [id])

  const handleChatRoomRefresh = useCallback(async () => {
    setListRefreshing(true)
    try {
      refreshConvRow()
      await refresh()
    } finally {
      setListRefreshing(false)
    }
  }, [refresh, refreshConvRow])

  // Silenced DMs are hidden from the list; kick out if opened via deep link or stale route.
  useEffect(() => {
    if (!convRow || convRow.type !== 'dm' || !convRow.other_user_id) return
    if (!silencedUserIds.has(convRow.other_user_id)) return
    router.replace(routes.chat())
  }, [convRow, silencedUserIds, router])

  // Focus input after the reaction picker fully closes (Reply).
  useEffect(() => {
    if (!picker && focusInputAfterPickerRef.current) {
      focusInputAfterPickerRef.current = false
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [picker])

  // markRead lives in useMessages: debounced, on first open and on new incoming
  // messages only (not on pagination or our own sends).

  const otherName = convRow?.type === 'dm'
    ? chatPeerName({ first_name: convRow.other_user_first_name, last_name: convRow.other_user_last_name, username: convRow.other_user_username ?? '' })
    : ''
  const headerTitle = convRow ? (isClub ? (convRow.club_name ?? 'Club Chat') : otherName) : '…'
  const headerAvatar = profileAvatarSmallUri(isDm ? convRow?.other_user_avatar_url : convRow?.club_avatar_url)

  const confirmSilenceUser = useCallback((senderId: string) => {
    confirmDestructive(
      'Silence this user?',
      'Their chat messages will be hidden. Events and club activity stay the same. Undo anytime under Profile → Silenced people.',
      'Silence',
      () => { void silenceUser(senderId) },
    )
  }, [silenceUser])

  const reportTarget = isDm && convRow?.other_user_id
    ? { id: convRow.other_user_id, name: chatPeerName({ first_name: convRow.other_user_first_name, last_name: convRow.other_user_last_name, username: convRow.other_user_username ?? 'player' }) }
    : null

  const dmHeaderMenuOptions = useMemo(() => {
    if (!convRow || convRow.type !== 'dm' || !convRow.other_user_id || !myId || convRow.other_user_id === myId) return []
    const oid = convRow.other_user_id
    return [
      { key: 'profile', label: 'View profile', onPress: () => router.push(routes.profileOf(oid)) },
      { key: 'report', label: 'Report player', destructive: true, onPress: () => setReportOpen(true) },
      { key: 'silence', label: 'Silence user', destructive: true, onPress: () => confirmSilenceUser(oid) },
    ]
  }, [convRow, myId, router, confirmSilenceUser])

  const { setReplyTo, startEdit } = composer
  // One bubble; the platform list (ChatMessageList / .web) owns ordering and scrolling.
  const renderMessage = useCallback((item: MessageWithDetails) => {
    const isOwn = item.sender_id === myId
    const senderSilenced = !isOwn && silencedUserIds.has(item.sender_id)
    const replySilenced = !!(item.reply_to?.profiles?.id && silencedUserIds.has(item.reply_to.profiles.id))
    return (
      <MessageBubble
        message={item}
        isOwn={isOwn}
        showAvatar={isClub}
        contentSuppressed={senderSilenced}
        replyContentSuppressed={replySilenced}
        onViewPeerProfilePress={isClub ? (uid => router.push(routes.profileOf(uid))) : undefined}
        onSilencePeerPress={isClub ? confirmSilenceUser : undefined}
        onLongPress={(message, pos) => setPicker({ message, pos })}
        onReplyPress={msg => setReplyTo(msg)}
        onImagePress={setViewingImage}
        onRetryPress={msg => void retryMessage(msg.id)}
      />
    )
  }, [myId, isClub, silencedUserIds, router, confirmSilenceUser, retryMessage, setReplyTo])

  const blurComposer = useCallback(() => inputRef.current?.blur(), [])

  const replyTo = composer.replyTo
  const replyLabel = `Replying to ${replyTo?.profiles ? chatPeerName(replyTo.profiles) : 'message'}`
  const replyBody = replyTo?.profiles?.id && myId && replyTo.profiles.id !== myId && silencedUserIds.has(replyTo.profiles.id)
    ? 'Hidden'
    : (replyTo?.content ?? (replyTo?.image_url ? '📷 Image' : ''))

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ChatRoomHeader
        title={headerTitle}
        avatarUri={headerAvatar}
        isClub={isClub}
        onBack={() => (router.canGoBack() ? router.back() : router.replace(routes.chat()))}
        onOpenMenu={dmHeaderMenuOptions.length > 0 ? setHeaderMenuAnchor : undefined}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
        keyboardVerticalOffset={0}
      >
        {loading || (messagesError && messages.length === 0) ? (
          <ScreenState
            loading={loading}
            error={messagesError ? "Couldn't load messages. Check your connection and try again." : null}
            onRetry={() => void handleChatRoomRefresh()}
          />
        ) : (
          <ChatMessageList
            messages={messages}
            myId={myId}
            renderMessage={renderMessage}
            hasMore={hasMore}
            onLoadMore={loadMore}
            refreshing={listRefreshing}
            onRefresh={() => void handleChatRoomRefresh()}
            onUserDrag={blurComposer}
          />
        )}
        <ChatComposer ref={inputRef} composer={composer} isClub={isClub} replyLabel={replyLabel} replyBody={replyBody} />
      </KeyboardAvoidingView>

      <AnchorOptionsMenu
        visible={!!headerMenuAnchor}
        anchor={headerMenuAnchor}
        options={dmHeaderMenuOptions}
        onDismiss={() => setHeaderMenuAnchor(null)}
      />

      <ReactionPicker
        visible={!!picker}
        message={picker?.message ?? null}
        position={picker?.pos ?? { x: 0, y: 0 }}
        viewerUserId={myId}
        onReact={(msgId, emoji) => void toggleReaction(msgId, emoji)}
        onReply={msg => {
          setReplyTo(msg)
          focusInputAfterPickerRef.current = true
        }}
        onEdit={startEdit}
        onDelete={msgId => void deleteMessage(msgId)}
        onSilence={confirmSilenceUser}
        onDismiss={() => setPicker(null)}
      />

      <ImageViewer uri={viewingImage} onClose={() => setViewingImage(null)} />

      {/* Incoming DM with a bad word (useBadWordPrompt). */}
      <ConfirmDialog
        visible={badWord.visible}
        title="This player may be unsportsmanlike"
        body="Would you like to report this user?"
        confirmLabel="Report"
        cancelLabel="Close"
        onCancel={badWord.dismiss}
        onConfirm={() => {
          badWord.dismiss()
          // Defer so the dialog can close before the report sheet opens.
          setTimeout(() => setReportOpen(true), 0)
        }}
      />
      {reportTarget ? (
        <ReportSheet
          visible={reportOpen}
          onDismiss={() => setReportOpen(false)}
          target={reportTarget}
          kind="dm"
          contextId={id ?? null}
          offerSilence={!silencedUserIds.has(reportTarget.id)}
          silenceByDefault
          onSilence={() => silenceUser(reportTarget.id)}
        />
      ) : null}
    </View>
  )
}
