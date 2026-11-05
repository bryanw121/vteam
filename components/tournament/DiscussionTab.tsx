import React, { useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import type { RefreshControlProps } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { shared, theme } from '../../constants'
import { profileDisplayName } from '../../utils'
import { Button } from '../Button'
import { DiscussionComposer } from '../DiscussionComposer'
import type { MentionUser, TournamentCommentWithAuthor } from '../../types'
import { CommentRow } from './CommentRow'
import { Spinner } from '../ui/Spinner'

type Props = {
  /** Pull-to-refresh for the whole tournament page. */
  refreshControl?: React.ReactElement<RefreshControlProps>
  comments: TournamentCommentWithAuthor[]
  /** Older comments exist beyond the loaded newest page. */
  hasEarlier: boolean
  loadingEarlier: boolean
  onLoadEarlier: () => void
  loading: boolean
  error: boolean
  onRetry: () => void
  viewerId: string | null
  isCreator: boolean
  mentionableUsers: MentionUser[]
  /** Throws on failure so the composer keeps the draft. */
  onPost: (v: { body: string; isAnnouncement: boolean; mentionIds: string[]; replyToId: string | null; editingId: string | null }) => Promise<void>
  onRequestDelete: (commentId: string) => void
}

export function DiscussionTab({ comments, hasEarlier, loadingEarlier, onLoadEarlier, loading, error, onRetry, viewerId, isCreator, mentionableUsers, onPost, onRequestDelete, refreshControl }: Props) {
  const insets = useSafeAreaInsets()
  const scrollRef = useRef<ScrollView>(null)
  const [replyTo, setReplyTo] = useState<TournamentCommentWithAuthor | null>(null)
  const [editing, setEditing] = useState<TournamentCommentWithAuthor | null>(null)

  const usernameToId = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of mentionableUsers) m.set(u.username, u.id)
    return m
  }, [mentionableUsers])

  const topLevel = comments.filter(c => !c.parent_id)
  // Keep the reader's place when older comments are prepended.
  const scrollYRef = useRef(0)
  const contentHeightRef = useRef(0)
  const anchorRef = useRef<{ y: number; height: number } | null>(null)
  const loadEarlier = () => {
    anchorRef.current = { y: scrollYRef.current, height: contentHeightRef.current }
    onLoadEarlier()
  }
  // The load finished without adding rows (error / nothing older): drop the anchor.
  useEffect(() => {
    if (loadingEarlier) return
    const t = setTimeout(() => { anchorRef.current = null }, 500)
    return () => clearTimeout(t)
  }, [loadingEarlier])
  const scrollToEnd = () => scrollRef.current?.scrollToEnd({ animated: true })

  async function handlePost(body: string, isAnnouncement: boolean, mentionIds: string[]) {
    await onPost({
      body,
      isAnnouncement: isAnnouncement && isCreator,
      mentionIds,
      replyToId: replyTo?.id ?? null,
      editingId: editing?.id ?? null,
    })
    const wasEditing = !!editing
    setEditing(null)
    setReplyTo(null)
    if (!wasEditing) setTimeout(scrollToEnd, 100)
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 88}>
      {loading && comments.length === 0 ? (
        <View style={shared.centered}><Spinner color={theme.colors.primary} /></View>
      ) : error && comments.length === 0 ? (
        <View style={shared.screenStateCenter}>
          <Text style={[shared.caption, shared.emptyStateBody]}>Couldn't load the discussion.</Text>
          <Button label="Retry" variant="secondary" size="sm" fullWidth={false} onPress={onRetry} />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, paddingBottom: 8, gap: 4 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
          onScroll={e => { scrollYRef.current = e.nativeEvent.contentOffset.y }}
          scrollEventThrottle={64}
          onContentSizeChange={(_w, h) => {
            const anchor = anchorRef.current
            contentHeightRef.current = h
            if (anchor && h > anchor.height) {
              anchorRef.current = null
              scrollRef.current?.scrollTo({ y: anchor.y + (h - anchor.height), animated: false })
            }
          }}
        >
          {hasEarlier ? (
            <TouchableOpacity
              onPress={loadEarlier}
              disabled={loadingEarlier}
              accessibilityRole="button"
              accessibilityLabel="Load earlier comments"
              testID="tournament-discussion-load-earlier"
              style={shared.loadEarlierButton}
            >
              {loadingEarlier
                ? <Spinner size="small" color={theme.colors.primary} />
                : <Text style={shared.loadEarlierLabel}>Load earlier comments</Text>}
            </TouchableOpacity>
          ) : null}
          {topLevel.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <Ionicons name="chatbubbles-outline" size={40} color={theme.colors.border} />
              <Text style={{ fontSize: theme.font.size.md, color: theme.colors.subtext, marginTop: 12 }}>No messages yet. Start the conversation.</Text>
            </View>
          )}
          {topLevel.map(c => (
            <CommentRow
              key={c.id}
              comment={c}
              replies={comments.filter(r => r.parent_id === c.id)}
              viewerId={viewerId}
              isOrganizer={isCreator}
              usernameToId={usernameToId}
              onReply={setReplyTo}
              onEdit={setEditing}
              onDelete={onRequestDelete}
            />
          ))}
        </ScrollView>
      )}

      {viewerId && (
        <View style={{
          paddingHorizontal: 16, paddingTop: 8,
          paddingBottom: insets.bottom + 8,
          borderTopWidth: 1, borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        }}>
          <DiscussionComposer
            mentionableUsers={mentionableUsers}
            onPost={handlePost}
            showAnnouncementToggle={isCreator}
            announcementLabel="Post as announcement"
            placeholder="Add a comment…"
            replyToAuthor={replyTo ? (replyTo.profiles ? profileDisplayName(replyTo.profiles) : 'Member') : null}
            onClearReply={() => setReplyTo(null)}
            editingBody={editing?.body ?? null}
            onCancelEdit={() => setEditing(null)}
            onFocusScroll={scrollToEnd}
          />
        </View>
      )}
    </KeyboardAvoidingView>
  )
}
