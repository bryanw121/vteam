import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View, FlatList, TouchableOpacity, Modal, Pressable, Platform } from 'react-native'
import { Text, TextInput } from '../../../components/ui/Text'
import { RefreshControl } from '../../../components/RefreshControl'
import { Image } from 'expo-image'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter, Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { theme, shared, CHAT_TAB_INDEX } from '../../../constants'
import { useConversations } from '../../../hooks/useConversations'
import { supabase } from '../../../lib/supabase'
import { useSilencedUsers } from '../../../hooks/useSilencedUsers'
import { useOpenDm } from '../../../hooks/useOpenDm'
import { useTabsActive, useTabsShell } from '../../../contexts/tabs'
import { timeAgo, lastMessagePreview } from '../../../utils/chatUtils'
import { profileAvatarSmallUri, profileDisplayName, confirmDestructive } from '../../../utils'
import { searchMembers } from '../../../lib/memberSearch'
import { routes } from '../../../utils/routes'
import type { ConversationRow, Profile } from '../../../types'
import { useSession } from '../../../contexts/session'
import { SignInPrompt } from '../../../components/SignInPrompt'
import { ScreenState } from '../../../components/ui'
import { Spinner } from '../../../components/ui/Spinner'

function conversationTitle(row: ConversationRow): string {
  if (row.type === 'club') return row.club_name ?? 'Club Chat'
  return profileDisplayName({
    username: row.other_user_username ?? 'Direct Message',
    first_name: row.other_user_first_name,
    last_name: row.other_user_last_name,
  })
}

// ── User search for starting a new DM ─────────────────────────────────────────
function NewDMModal({ visible, onDismiss, onSelect, silencedUserIds, myId }: {
  visible: boolean
  onDismiss: () => void
  onSelect: (userId: string) => void
  silencedUserIds: Set<string>
  myId: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        setResults(await searchMembers(query, { limit: 20, exclude: [myId] }) as Profile[])
      } catch (e) {
        console.error('[NewDMModal] search', (e as Error)?.message)
        setResults([])
      }
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query, myId])

  function handleDismiss() {
    setQuery('')
    setResults([])
    onDismiss()
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleDismiss}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.md,
          borderBottomWidth: 1, borderBottomColor: theme.colors.border,
          gap: theme.spacing.md,
        }}>
          <TextInput
            autoFocus
            placeholder="Search by name or username…"
            placeholderTextColor={theme.colors.subtext}
            value={query}
            onChangeText={setQuery}
            style={{
              flex: 1, height: 40,
              backgroundColor: theme.colors.card,
              borderRadius: theme.radius.lg,
              paddingHorizontal: 14,
              fontSize: theme.font.size.md,
              color: theme.colors.text,
            }}
          />
          <TouchableOpacity onPress={handleDismiss}>
            <Text style={{ color: theme.colors.primary, fontSize: theme.font.size.md }}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {searching ? (
          <View style={{ padding: theme.spacing.xl, alignItems: 'center' }}>
            <Spinner color={theme.colors.primary} />
          </View>
        ) : (
          <FlatList
            data={results.filter(p => !silencedUserIds.has(p.id))}
            keyExtractor={p => p.id}
            renderItem={({ item }) => {
              const name = profileDisplayName(item)
              return (
                <TouchableOpacity
                  onPress={() => {
                    handleDismiss()
                    onSelect(item.id)
                  }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
                    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
                    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
                  }}
                >
                  <View style={{
                    width: 44, height: 44, borderRadius: 22,
                    backgroundColor: theme.colors.border,
                    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                  }}>
                    {profileAvatarSmallUri(item.avatar_url, 120) ? (
                      <Image source={{ uri: profileAvatarSmallUri(item.avatar_url, 120)! }} style={{ width: 44, height: 44 }} contentFit="cover" transition={150} />
                    ) : (
                      <Ionicons name="person" size={22} color={theme.colors.subtext} />
                    )}
                  </View>
                  <View>
                    <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.medium, color: theme.colors.text }}>
                      {name}
                    </Text>
                    <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>@{item.username}</Text>
                  </View>
                </TouchableOpacity>
              )
            }}
            ListEmptyComponent={query.trim() ? (
              <Text style={[shared.caption, { textAlign: 'center', padding: theme.spacing.xl }]}>
                No users found
              </Text>
            ) : null}
          />
        )}
      </View>
    </Modal>
  )
}

// ── Chat list screen ───────────────────────────────────────────────────────────
function ChatScreenSignedIn({ myId }: { myId: string }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { tabBarHeight } = useTabsShell()
  const { activeTabIndex } = useTabsActive()
  // Mobile / narrow web keep this screen mounted in the pager while another tab
  // is showing; it then only reads the shared cache (no fetch, no channel).
  const chatActive = activeTabIndex === CHAT_TAB_INDEX
  const { conversations, hasData, loading, error, refetch, clearUnread } = useConversations(chatActive)
  const { silencedUserIds, silenceUser } = useSilencedUsers()
  const [newDMVisible, setNewDMVisible] = useState(false)
  const [listRefreshing, setListRefreshing] = useState(false)

  const handleChatListRefresh = useCallback(async () => {
    setListRefreshing(true)
    try {
      await refetch()
    } finally {
      setListRefreshing(false)
    }
  }, [refetch])

  const visibleConversations = useMemo(() => {
    const filtered = conversations.filter(row => {
      if (row.type !== 'dm') return true
      if (!row.other_user_id) return true
      return !silencedUserIds.has(row.other_user_id)
    })
    // Unread conversations first, then by most recent message
    return filtered.sort((a, b) => {
      const aUnread = (a.unread_count ?? 0) > 0
      const bUnread = (b.unread_count ?? 0) > 0
      if (aUnread !== bUnread) return aUnread ? -1 : 1
      return (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')
    })
  }, [conversations, silencedUserIds])

  const { openDm: openDM } = useOpenDm()

  function openConversation(row: ConversationRow) {
    clearUnread(row.conversation_id)
    router.push(routes.conversation(row.conversation_id))
  }

  function confirmSilenceFromList(otherUserId: string, label: string) {
    confirmDestructive(
      'Silence this user?',
      `${label} — their chat messages will be hidden. Undo under Profile → Silenced people.`,
      'Silence',
      () => { void silenceUser(otherUserId) },
    )
  }

  function renderRow({ item }: { item: ConversationRow }) {
    const title = conversationTitle(item)
    const preview = lastMessagePreview(item, myId, silencedUserIds)
    const time = timeAgo(item.last_message_at)
    const hasUnread = (item.unread_count ?? 0) > 0
    const avatarUrl = profileAvatarSmallUri(item.type === 'dm' ? item.other_user_avatar_url : item.club_avatar_url, 120)
    const isClub = item.type === 'club'

    const canSilenceDm = item.type === 'dm' && item.other_user_id && item.other_user_id !== myId

    return (
      <Pressable
        testID="conversation-row"
        accessibilityRole="button"
        onPress={() => openConversation(item)}
        onLongPress={canSilenceDm ? () => confirmSilenceFromList(item.other_user_id!, conversationTitle(item)) : undefined}
        {...(Platform.OS === 'web' && canSilenceDm
          ? {
              onContextMenu: (e: { preventDefault?: () => void }) => {
                e.preventDefault?.()
                confirmSilenceFromList(item.other_user_id!, conversationTitle(item))
              },
            }
          : {})}
        delayLongPress={480}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          gap: theme.spacing.md,
          borderBottomWidth: 1, borderBottomColor: theme.colors.border,
          opacity: pressed ? 0.88 : 1,
        })}
      >
        {/* Avatar */}
        <View style={{
          width: 52, height: 52, borderRadius: isClub ? 14 : 26,
          backgroundColor: theme.colors.border,
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          flexShrink: 0,
        }}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={{ width: 52, height: 52 }} contentFit="cover" transition={150} />
          ) : (
            <Ionicons name={isClub ? 'people' : 'person'} size={26} color={theme.colors.subtext} />
          )}
        </View>

        {/* Content */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text
              style={{ fontFamily: hasUnread ? theme.fonts.displaySemiBold : theme.fonts.displayMedium, fontSize: theme.font.size.md, color: theme.colors.text, flex: 1 }}
              numberOfLines={1}
            >
              {title}
            </Text>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: hasUnread ? theme.colors.primary : theme.colors.subtext, flexShrink: 0 }}>
              {time}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <Text
              style={{ flex: 1, fontFamily: hasUnread ? theme.fonts.bodyMedium : theme.fonts.body, fontSize: theme.font.size.sm, color: hasUnread ? theme.colors.text : theme.colors.subtext }}
              numberOfLines={1}
            >
              {preview}
            </Text>
            {hasUnread && (
              <View testID="conversation-unread" style={{
                minWidth: 20, height: 20, borderRadius: 10,
                backgroundColor: theme.colors.primary,
                alignItems: 'center', justifyContent: 'center',
                paddingHorizontal: 5, flexShrink: 0,
              }}>
                <Text style={{ fontFamily: theme.fonts.bodyBold, fontSize: theme.font.size.xs, color: theme.colors.white }}>
                  {item.unread_count > 99 ? '99+' : item.unread_count}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    )
  }

  return (
    <View style={[shared.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, fontWeight: '700', color: theme.colors.subtext, letterSpacing: 1, textTransform: 'uppercase' }}>
              Direct messages
            </Text>
            <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.heading.xxl, letterSpacing: -1.2, color: theme.colors.text, lineHeight: 38, marginTop: 1 }}>
              Chat
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setNewDMVisible(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="New message"
            style={{
              width: 38, height: 38, borderRadius: 12,
              backgroundColor: theme.colors.primary,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 4,
            }}
          >
            <Ionicons name="add" size={22} color={theme.colors.white} />
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <TouchableOpacity
          onPress={() => setNewDMVisible(true)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: theme.colors.card,
            borderWidth: 1, borderColor: theme.colors.border,
            borderRadius: 12,
            paddingHorizontal: 12, paddingVertical: 10,
            marginTop: theme.spacing.sm,
          }}
        >
          <Ionicons name="search-outline" size={16} color={theme.colors.subtext} />
          <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.subtext }}>Search people</Text>
        </TouchableOpacity>
      </View>

      <ScreenState
        loading={loading}
        ready={hasData}
        error={error ? "Couldn't load your chats. Check your connection and try again." : null}
        onRetry={() => void handleChatListRefresh()}
      >
        <FlatList
          data={visibleConversations}
          keyExtractor={r => r.conversation_id}
          renderItem={renderRow}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}
          refreshControl={
            <RefreshControl
              refreshing={listRefreshing}
              onRefresh={() => void handleChatListRefresh()}
              tintColor={theme.colors.primary}
            />
          }
          ListHeaderComponent={visibleConversations.length === 0 ? (
            <View style={[shared.centered, { paddingTop: 60 }]}>
              <Ionicons name="chatbubbles-outline" size={48} color={theme.colors.border} />
              <Text style={[shared.body, { marginTop: theme.spacing.md, color: theme.colors.subtext, textAlign: 'center', paddingHorizontal: theme.spacing.xl }]}>
                {conversations.length > 0
                  ? 'No conversations here. Direct chats with people you silenced stay hidden until you unsilence them under Profile → Silenced people.'
                  : 'No messages yet.\nTap the icon above to start a conversation.'}
              </Text>
            </View>
          ) : null}
        />
      </ScreenState>

      <NewDMModal
        visible={newDMVisible}
        onDismiss={() => setNewDMVisible(false)}
        onSelect={openDM}
        silencedUserIds={silencedUserIds}
        myId={myId}
      />
    </View>
  )
}

/** Guests see a sign-in prompt; the signed-in screen (and its data hooks) only mounts with a session. */
export default function ChatScreen() {
  const { userId, loading } = useSession()
  if (loading) return null
  if (!userId) {
    return (
      <SignInPrompt
        icon="chatbubbles-outline"
        title="Chat with your club"
        body="Sign in or sign up to message players and see your club chats."
      />
    )
  }
  return <ChatScreenSignedIn myId={userId} />
}
