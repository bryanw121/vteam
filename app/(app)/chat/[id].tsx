import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Image, Pressable, Modal } from 'react-native'
import { Text, TextInput } from '../../../components/ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'

import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../../lib/supabase'
import { theme, shared } from '../../../constants'
import {
  DM_BAD_WORD_PROMPT_COOLDOWN_MS,
  dmMessageContainsBadWord,
  loadDmBadWordPromptAt,
  saveDmBadWordPromptAt,
} from '../../../constants/dmBadWords'
import { useSession } from '../../../contexts/session'
import { useMessages } from '../../../hooks/useMessages'
import { useConversationRow } from '../../../hooks/useConversations'
import { useSilencedUsers } from '../../../hooks/useSilencedUsers'
import { AnchorOptionsMenu } from '../../../components/AnchorOptionsMenu'
import type { AnchorRect } from '../../../types'
import { MessageBubble } from '../../../components/MessageBubble'
import { ChatMessageList } from '../../../components/ChatMessageList'
import { ReactionPicker } from '../../../components/ReactionPicker'
import { ScreenState } from '../../../components/ui'
import type { MessageWithDetails, MentionUser } from '../../../types'
import { profileAvatarSmallUri, profileDisplayName, confirmDestructive } from '../../../utils'
import { chatAlert } from '../../../utils/chatUtils'
import { routes } from '../../../utils/routes'
import { Spinner } from '../../../components/ui/Spinner'
import { toast } from '../../../lib/toast'

const AVATAR_SIZE = 36

/** Empty string for a missing profile; otherwise the shared member display name. */
function displayName(p: { first_name: string | null; last_name: string | null; username: string } | null) {
  if (!p) return ''
  return profileDisplayName(p)
}

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const inputRef = useRef<import('react-native').TextInput>(null)


  const { userId: myId } = useSession()
  // Header data comes from the shared conversations store (no request once the list has loaded).
  const { row: convRow, refresh: refreshConvRow } = useConversationRow(id)
  const [text, setText] = useState('')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [replyTo, setReplyTo] = useState<MessageWithDetails | null>(null)
  const [editingMessage, setEditingMessage] = useState<MessageWithDetails | null>(null)

  // @mention state (club chats only — DMs don't use mentions)
  const [mentionableUsers, setMentionableUsers] = useState<MentionUser[]>([])
  const [activeMention, setActiveMention] = useState<{ query: string; atIndex: number } | null>(null)
  const cursorPosRef = useRef(0)

  // Reaction picker state
  const [pickerVisible, setPickerVisible] = useState(false)
  const [pickerMessage, setPickerMessage] = useState<MessageWithDetails | null>(null)
  const [pickerPos, setPickerPos] = useState({ x: 0, y: 0 })
  const focusInputAfterPickerRef = useRef(false)

  // Full-screen image viewer
  const [viewingImage, setViewingImage] = useState<string | null>(null)

  const headerKebabRef = useRef<View>(null)
  const [headerMenuVisible, setHeaderMenuVisible] = useState(false)
  const [headerMenuAnchor, setHeaderMenuAnchor] = useState<AnchorRect | null>(null)
  const [unsportsmanlikeModalVisible, setUnsportsmanlikeModalVisible] = useState(false)
  const badWordPromptedMessageIdsRef = useRef<Set<string>>(new Set())
  const lastBadWordPromptAtRef = useRef(0)
  const [badWordPromptCooldownReady, setBadWordPromptCooldownReady] = useState(false)

  const {
    messages, loading, error: messagesError, hasMore, loadMore, refresh,
    sendMessage, retryMessage, deleteMessage, editMessage, toggleReaction, uploadImage,
  } = useMessages(id)
  const [listRefreshing, setListRefreshing] = useState(false)
  const { silencedUserIds, silenceUser } = useSilencedUsers()

  // Load club members for @mention autocomplete (club chats only)
  useEffect(() => {
    if (!convRow || convRow.type !== 'club' || !convRow.club_id) return
    async function loadMembers() {
      const { data } = await supabase
        .from('club_members')
        .select('profiles!club_members_user_id_fkey(id, username, first_name, last_name)')
        .eq('club_id', convRow!.club_id!)
        .neq('user_id', myId ?? '')
      const users: MentionUser[] = (data ?? []).flatMap((row: any) => {
        const p = row.profiles
        if (!p) return []
        return [{ id: p.id, username: p.username, displayName: profileDisplayName(p) }]
      })
      setMentionableUsers(users)
    }
    void loadMembers()
  }, [convRow?.club_id, myId])

  useEffect(() => {
    setHeaderMenuVisible(false)
    setHeaderMenuAnchor(null)
  }, [id])

  useEffect(() => {
    badWordPromptedMessageIdsRef.current = new Set()
    lastBadWordPromptAtRef.current = 0
    setUnsportsmanlikeModalVisible(false)
    setBadWordPromptCooldownReady(false)
    void loadDmBadWordPromptAt(id).then(ts => {
      lastBadWordPromptAtRef.current = ts
      setBadWordPromptCooldownReady(true)
    })
  }, [id])

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

  // Focus input after reaction picker fully closes
  useEffect(() => {
    if (!pickerVisible && focusInputAfterPickerRef.current) {
      focusInputAfterPickerRef.current = false
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [pickerVisible])

  // markRead lives in useMessages: debounced, on first open and on new incoming
  // messages only (not on pagination or our own sends).

  const headerTitle = convRow
    ? (convRow.type === 'club'
        ? (convRow.club_name ?? 'Club Chat')
        : displayName({
            first_name: convRow.other_user_first_name,
            last_name: convRow.other_user_last_name,
            username: convRow.other_user_username ?? '',
          }))
    : '…'

  const headerAvatar = profileAvatarSmallUri(
    convRow?.type === 'dm' ? convRow.other_user_avatar_url : convRow?.club_avatar_url
  )

  const isClub = convRow?.type === 'club'

  function detectMention(t: string, cursor: number) {
    if (mentionableUsers.length === 0) { setActiveMention(null); return }
    const before = t.slice(0, cursor)
    const match = before.match(/(^|\s)@(\w*)$/)
    if (match) setActiveMention({ query: match[2], atIndex: before.lastIndexOf('@') })
    else setActiveMention(null)
  }

  function handleTextChange(t: string) {
    setText(t)
    detectMention(t, cursorPosRef.current)
  }

  function handleSelectionChange(e: any) {
    const pos: number = e.nativeEvent.selection.start
    cursorPosRef.current = pos
    detectMention(text, pos)
  }

  function selectMention(user: MentionUser) {
    if (!activeMention) return
    const before = text.slice(0, activeMention.atIndex)
    const after = text.slice(cursorPosRef.current)
    const newText = `${before}@${user.username} ${after}`
    setText(newText)
    cursorPosRef.current = activeMention.atIndex + user.username.length + 2
    setActiveMention(null)
  }

  const mentionSuggestions = useMemo(() => {
    if (!activeMention || mentionableUsers.length === 0) return []
    const q = activeMention.query.toLowerCase()
    return mentionableUsers
      .filter(u => !q || u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
      .slice(0, 6)
  }, [activeMention, mentionableUsers])

  async function handleSend() {
    const trimmed = text.trim()
    if (editingMessage) {
      if (!trimmed) return
      const editing = editingMessage
      setText('')
      inputRef.current?.clear()
      setEditingMessage(null)
      const ok = await editMessage(editing.id, trimmed)
      if (!ok) {
        // The bubble was rolled back; put the edit back in the composer.
        setEditingMessage(editing)
        setText(cur => cur || trimmed)
      }
      return
    }
    if (!trimmed && !imageUri) return
    const mentionIds = mentionableUsers.length > 0
      ? [...new Set(
          [...trimmed.matchAll(/@(\w+)/g)]
            .map(m => mentionableUsers.find(u => u.username === m[1])?.id)
            .filter((mid): mid is string => Boolean(mid)),
        )]
      : []
    const pickedImage = imageUri
    const replyingTo = replyTo
    setText('')
    inputRef.current?.clear()
    setImageUri(null)
    setReplyTo(null)
    setActiveMention(null)
    setSending(true)
    try {
      let uploadedUrl: string | null = null
      if (pickedImage) {
        setUploadingImage(true)
        uploadedUrl = await uploadImage(pickedImage)
        setUploadingImage(false)
        if (!uploadedUrl) {
          // Never send the text alone when the picture didn't make it: restore the draft.
          setText(cur => cur || trimmed)
          setImageUri(cur => cur ?? pickedImage)
          setReplyTo(cur => cur ?? replyingTo)
          chatAlert("Couldn't upload image", 'Your message was not sent. Check your connection and try again.')
          return
        }
      }
      // On failure the bubble stays in the list as "Not sent · Tap to retry" —
      // the one recovery path. Restoring the draft too invited a second send of
      // the same message alongside the retry.
      await sendMessage(trimmed || null, uploadedUrl, replyingTo, mentionIds)
    } finally {
      setUploadingImage(false)
      setSending(false)
    }
  }

  async function handlePickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    })
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri)
    }
  }

  function handleLongPress(message: MessageWithDetails, position: { x: number; y: number }) {
    setPickerMessage(message)
    setPickerPos(position)
    setPickerVisible(true)
  }

  const confirmSilenceUser = useCallback((senderId: string) => {
    confirmDestructive(
      'Silence this user?',
      'Their chat messages will be hidden. Events and club activity stay the same. Undo anytime under Profile → Silenced people.',
      'Silence',
      () => { void silenceUser(senderId) },
    )
  }, [silenceUser])

  const submitStubDmReport = useCallback(() => {
    if (!convRow || convRow.type !== 'dm') return
    const name = displayName({
      first_name: convRow.other_user_first_name,
      last_name: convRow.other_user_last_name,
      username: convRow.other_user_username ?? 'player',
    })
    toast.show({ title: 'Report submitted', message: `${name} has been reported to vteam.`, variant: 'success' })
  }, [convRow])

  const confirmReportDmUser = useCallback(() => {
    if (!convRow || convRow.type !== 'dm') return
    const name = displayName({
      first_name: convRow.other_user_first_name,
      last_name: convRow.other_user_last_name,
      username: convRow.other_user_username ?? 'player',
    })

    confirmDestructive(
      'Report this player?',
      `Send a moderation report about ${name} to vteam?`,
      'Report',
      submitStubDmReport,
    )
  }, [convRow, submitStubDmReport])

  const dmHeaderMenuOptions = useMemo(() => {
    if (!convRow || convRow.type !== 'dm' || !convRow.other_user_id || !myId || convRow.other_user_id === myId) return []
    const oid = convRow.other_user_id
    return [
      { key: 'profile', label: 'View profile', onPress: () => router.push(routes.profileOf(oid)) },
      { key: 'report', label: 'Report player', destructive: true, onPress: confirmReportDmUser },
      { key: 'silence', label: 'Silence user', destructive: true, onPress: () => confirmSilenceUser(oid) },
    ]
  }, [convRow, myId, router, confirmSilenceUser, confirmReportDmUser])

  // Incoming DM text contained a bad word — prompt at most once per cooldown; still dedupe per message id.
  useEffect(() => {
    if (!badWordPromptCooldownReady || loading || !myId || convRow?.type !== 'dm') return
    if (unsportsmanlikeModalVisible) return

    const now = Date.now()
    for (const m of messages) {
      if (m._sending) continue
      if (m.sender_id === myId) continue
      if (m.deleted_at) continue
      if (!dmMessageContainsBadWord(m.content)) continue
      if (badWordPromptedMessageIdsRef.current.has(m.id)) continue
      badWordPromptedMessageIdsRef.current.add(m.id)
      if (now - lastBadWordPromptAtRef.current < DM_BAD_WORD_PROMPT_COOLDOWN_MS) continue
      lastBadWordPromptAtRef.current = now
      void saveDmBadWordPromptAt(id, now)
      setUnsportsmanlikeModalVisible(true)
      return
    }
  }, [messages, loading, myId, convRow?.type, unsportsmanlikeModalVisible, badWordPromptCooldownReady, id])

  function openHeaderOptionsMenu() {
    headerKebabRef.current?.measureInWindow((x, y, w, h) => {
      setHeaderMenuAnchor({ x, y, width: w, height: h })
      setHeaderMenuVisible(true)
    })
  }

  // One bubble; the platform list (ChatMessageList / .web) owns ordering and scrolling.
  const renderMessage = useCallback((item: MessageWithDetails) => {
    const isOwn = item.sender_id === myId
    const senderSilenced = !isOwn && silencedUserIds.has(item.sender_id)
    const replySilenced = !!(item.reply_to?.profiles?.id && silencedUserIds.has(item.reply_to.profiles.id))
    return (
      <MessageBubble
        message={item}
        isOwn={isOwn}
        showAvatar={isClub || false}
        contentSuppressed={senderSilenced}
        replyContentSuppressed={replySilenced}
        onViewPeerProfilePress={isClub ? (uid => router.push(routes.profileOf(uid))) : undefined}
        onSilencePeerPress={isClub ? confirmSilenceUser : undefined}
        onLongPress={handleLongPress}
        onReplyPress={msg => setReplyTo(msg)}
        onImagePress={setViewingImage}
        onRetryPress={msg => void retryMessage(msg.id)}
      />
    )
  }, [myId, isClub, silencedUserIds, router, confirmSilenceUser, retryMessage])

  const blurComposer = useCallback(() => inputRef.current?.blur(), [])

  const canSend = editingMessage
    ? text.trim().length > 0
    : (text.trim().length > 0 || !!imageUri) && !sending

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingTop: insets.top + 8,
        paddingBottom: theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
        borderBottomWidth: 1, borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.background,
        gap: theme.spacing.sm,
      }}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace(routes.chat())} style={{ padding: 4 }} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
        </TouchableOpacity>

        {/* Avatar */}
        <View style={{
          width: AVATAR_SIZE, height: AVATAR_SIZE,
          borderRadius: isClub ? 10 : AVATAR_SIZE / 2,
          backgroundColor: theme.colors.border,
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          {headerAvatar ? (
            <Image source={{ uri: headerAvatar }} style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }} />
          ) : (
            <Ionicons name={isClub ? 'people' : 'person'} size={18} color={theme.colors.subtext} />
          )}
        </View>

        <Text style={{ flex: 1, fontFamily: theme.fonts.display, fontSize: theme.font.size.lg, letterSpacing: -0.3, color: theme.colors.text }} numberOfLines={1}>
          {headerTitle}
        </Text>

        {dmHeaderMenuOptions.length > 0 ? (
          <View ref={headerKebabRef} collapsable={false}>
            <TouchableOpacity
              onPress={openHeaderOptionsMenu}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Conversation options"
            >
              <Ionicons name="ellipsis-vertical" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {/* Messages */}
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

        {/* Reply banner */}
        {replyTo && (
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: theme.colors.card,
            borderTopWidth: 1, borderTopColor: theme.colors.border,
            paddingHorizontal: theme.spacing.md, paddingVertical: 8,
            gap: theme.spacing.sm,
          }}>
            <Ionicons name="return-down-back" size={16} color={theme.colors.primary} />
            <View style={{ flex: 1, borderLeftWidth: 2, borderLeftColor: theme.colors.primary, paddingLeft: 8 }}>
              <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.primary, fontWeight: theme.font.weight.semibold }}>
                Replying to {replyTo.profiles ? displayName(replyTo.profiles) : 'message'}
              </Text>
              <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext }} numberOfLines={1}>
                {replyTo.profiles?.id && myId && replyTo.profiles.id !== myId && silencedUserIds.has(replyTo.profiles.id)
                  ? 'Hidden'
                  : (replyTo.content ?? (replyTo.image_url ? '📷 Image' : ''))}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel reply">
              <Ionicons name="close" size={18} color={theme.colors.subtext} />
            </TouchableOpacity>
          </View>
        )}

        {/* Edit banner */}
        {editingMessage && (
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: theme.colors.card,
            borderTopWidth: 1, borderTopColor: theme.colors.border,
            paddingHorizontal: theme.spacing.md, paddingVertical: 8,
            gap: theme.spacing.sm,
          }}>
            <Ionicons name="pencil-outline" size={16} color={theme.colors.primary} />
            <View style={{ flex: 1, borderLeftWidth: 2, borderLeftColor: theme.colors.primary, paddingLeft: 8 }}>
              <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.primary, fontWeight: theme.font.weight.semibold }}>
                Editing message
              </Text>
              <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext }} numberOfLines={1}>
                {editingMessage.content ?? ''}
              </Text>
            </View>
            <TouchableOpacity onPress={() => { setEditingMessage(null); setText(''); inputRef.current?.clear() }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel edit">
              <Ionicons name="close" size={18} color={theme.colors.subtext} />
            </TouchableOpacity>
          </View>
        )}

        {/* Image preview */}
        {imageUri && (
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: theme.colors.card,
            borderTopWidth: 1, borderTopColor: theme.colors.border,
            paddingHorizontal: theme.spacing.md, paddingVertical: 8,
            gap: theme.spacing.sm,
          }}>
            <Image source={{ uri: imageUri }} style={{ width: 60, height: 60, borderRadius: 8 }} resizeMode="cover" />
            <TouchableOpacity onPress={() => setImageUri(null)} hitSlop={8} style={{ position: 'absolute', top: 4, left: 56 }}>
              <View style={{ backgroundColor: theme.colors.subtext, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={12} color={theme.colors.white} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* @mention suggestion dropdown (club chat only) */}
        {mentionSuggestions.length > 0 && (
          <View style={{
            borderTopWidth: 1, borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.card,
            maxHeight: 200, overflow: 'hidden',
          }}>
            <ScrollView keyboardShouldPersistTaps="always" bounces={false}>
              {mentionSuggestions.map((u, idx) => (
                <TouchableOpacity
                  key={u.id}
                  onPress={() => selectMention(u)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingHorizontal: 16, paddingVertical: 10,
                    borderBottomWidth: idx < mentionSuggestions.length - 1 ? 1 : 0,
                    borderBottomColor: theme.colors.border, minHeight: 44,
                  }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="person" size={16} color={theme.colors.subtext} />
                  </View>
                  <View>
                    <Text style={{ fontSize: theme.font.size.md, fontWeight: '600', color: theme.colors.text }}>{u.displayName}</Text>
                    <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>@{u.username}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Input bar — pill composer */}
        <View style={{
          flexDirection: 'row', alignItems: 'flex-end',
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.sm,
          paddingBottom: insets.bottom + theme.spacing.sm,
          borderTopWidth: 1, borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.background,
          gap: theme.spacing.sm,
        }}>
          <TouchableOpacity
            onPress={handlePickImage}
            style={{ paddingBottom: 9 }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Attach image"
          >
            <Ionicons name="image-outline" size={22} color={theme.colors.subtext} />
          </TouchableOpacity>

          {/* Pill input container */}
          <View style={{
            flex: 1,
            flexDirection: 'row', alignItems: 'flex-end',
            backgroundColor: theme.colors.card,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: theme.colors.border,
            paddingLeft: 14,
            paddingRight: 4,
            paddingVertical: 4,
            minHeight: 40,
            maxHeight: 120,
          }}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={handleTextChange}
              onSelectionChange={isClub ? handleSelectionChange : undefined}
              placeholder="Message…"
              placeholderTextColor={theme.colors.subtext}
              multiline
              style={{
                flex: 1,
                paddingTop: 7,
                paddingBottom: 7,
                fontFamily: theme.fonts.body,
                fontSize: theme.font.size.md,
                color: theme.colors.text,
                minHeight: 32,
              }}
              // Web: Enter sends, Shift+Enter inserts a newline. onSubmitEditing
              // doesn't fire reliably for multiline <textarea> on RNW, so handle
              // the key directly.
              onKeyPress={Platform.OS === 'web' ? (e: any) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault?.()
                  void handleSend()
                }
              } : undefined}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!canSend}
              style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: canSend ? theme.colors.primary : 'transparent',
                alignItems: 'center', justifyContent: 'center',
                alignSelf: 'flex-end',
                marginBottom: 0,
              }}
            >
              {sending || uploadingImage ? (
                <Spinner size="small" color={canSend ? theme.colors.white : theme.colors.subtext} />
              ) : (
                <Ionicons name="send" size={16} color={canSend ? theme.colors.white : theme.colors.subtext} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Reaction / action picker */}
      <AnchorOptionsMenu
        visible={headerMenuVisible}
        anchor={headerMenuAnchor}
        options={dmHeaderMenuOptions}
        onDismiss={() => {
          setHeaderMenuVisible(false)
          setHeaderMenuAnchor(null)
        }}
      />

      <ReactionPicker
        visible={pickerVisible}
        message={pickerMessage}
        position={pickerPos}
        viewerUserId={myId}
        onReact={(msgId, emoji) => void toggleReaction(msgId, emoji)}
        onReply={msg => {
          setReplyTo(msg)
          focusInputAfterPickerRef.current = true
        }}
        onEdit={msg => {
          setEditingMessage(msg)
          setText(msg.content ?? '')
          setTimeout(() => inputRef.current?.focus(), 50)
        }}
        onDelete={msgId => void deleteMessage(msgId)}
        onSilence={confirmSilenceUser}
        onDismiss={() => setPickerVisible(false)}
      />

      {/* Full-screen image viewer */}
      {viewingImage && (
        <Modal visible animationType="fade" onRequestClose={() => setViewingImage(null)}>
          <Pressable
            style={{ flex: 1, backgroundColor: theme.colors.black, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => setViewingImage(null)}
          >
            <Image source={{ uri: viewingImage }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
          </Pressable>
        </Modal>
      )}

      {/* Unsportsmanlike language (DM) — bad-word prompt */}
      <Modal
        visible={unsportsmanlikeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUnsportsmanlikeModalVisible(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.lg,
          }}
          onPress={() => setUnsportsmanlikeModalVisible(false)}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 360,
              backgroundColor: theme.colors.card,
              borderRadius: theme.radius.xl,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: theme.spacing.lg,
              gap: theme.spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.spacing.sm }}>
              <Text
                style={{
                  flex: 1,
                  fontFamily: theme.fonts.displaySemiBold,
                  fontSize: theme.font.size.lg,
                  color: theme.colors.text,
                  lineHeight: theme.font.lineHeight.normal,
                }}
              >
                This player may be unsportsmanlike. Would you like to report this user?
              </Text>
              <TouchableOpacity
                onPress={() => setUnsportsmanlikeModalVisible(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={26} color={theme.colors.subtext} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => {
                setUnsportsmanlikeModalVisible(false)
                // Defer so the modal can dismiss before the system alert appears.
                setTimeout(() => confirmReportDmUser(), 0)
              }}
              style={{
                minHeight: 48,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: theme.spacing.sm + 2,
              }}
            >
              <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.white }}>
                Report
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}
