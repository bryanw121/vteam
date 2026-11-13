import React, { useState } from 'react'
import { PollBlock } from './club/PollBlock'
import { pollOf } from '../utils/clubPoll'
import { View, TouchableOpacity, ScrollView, StyleSheet, Platform, Modal, Pressable, KeyboardAvoidingView } from 'react-native'
import { isNetworkError, toast } from '../lib/toast'
import { getSessionUser } from '../lib/sessionUser'
import { Text, TextInput } from './ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { supabase } from '../lib/supabase'
import { shared, theme, CLUB_POST_COMMENT_MAX, CLUB_POST_BODY_MAX, GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE } from '../constants'
import { routes } from '../utils/routes'
import type { ClubPostCommentWithAuthor, ClubPostWithFeed } from '../types'
import { profileAvatarSmallUri, profileDisplayName } from '../utils'
import { ProfileAvatar } from './ProfileAvatar'
import { LinkedText } from './LinkedText'
import { Spinner } from './ui/Spinner'

function formatPostTime(iso: string): string {
  const normalized = /[Z+]/.test(iso) ? iso : iso + 'Z'
  const d = new Date(normalized)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

type ClubPostCardProps = {
  post: ClubPostWithFeed
  likedByMe: boolean
  currentUserId: string | null
  isClubMember: boolean
  onDataChanged: () => void
  /** Club polls (#175): the viewer owns the club (Create event), and member names for "who picked". */
  isClubOwner?: boolean
  memberName?: (userId: string) => string
}

export function ClubPostCard({
  post,
  likedByMe,
  currentUserId,
  isClubMember,
  onDataChanged,
  isClubOwner = false,
  memberName = () => 'Member',
}: ClubPostCardProps) {
  const poll = pollOf(post)
  const router = useRouter()
  const [likeBusy, setLikeBusy] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)

  const author = post.profiles
  const likeCount = post.club_post_likes?.[0]?.count ?? 0
  const comments = post.club_post_comments ?? []

  // Public bucket: the URL is built synchronously, so the avatar paints on the first render.
  const avatarUri = profileAvatarSmallUri(author?.avatar_url)

  async function toggleLike() {
    if (!currentUserId || !isClubMember || likeBusy) return
    setLikeBusy(true)
    try {
      if (likedByMe) {
        const { error } = await supabase
          .from('club_post_likes')
          .delete()
          .eq('club_post_id', post.id)
          .eq('user_id', currentUserId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('club_post_likes')
          .insert({ club_post_id: post.id, user_id: currentUserId })
        if (error) throw error
      }
      onDataChanged()
    } catch (e: unknown) {
      toast.error("Couldn't update your like", e)
    } finally {
      setLikeBusy(false)
    }
  }

  async function submitComment() {
    const body = commentDraft.trim()
    if (!body || !currentUserId || !isClubMember || commentBusy) return
    if (body.length > CLUB_POST_COMMENT_MAX) {
      toast.show({ title: 'Too long', message: `Comments can be at most ${CLUB_POST_COMMENT_MAX} characters.`, variant: 'warning' })
      return
    }
    setCommentBusy(true)
    try {
      const { error } = await supabase.from('club_post_comments').insert({
        club_post_id: post.id,
        user_id: currentUserId,
        body,
      })
      if (error) throw error
      setCommentDraft('')
      onDataChanged()
    } catch (e: unknown) {
      toast.error("Couldn't post your comment", e)
    } finally {
      setCommentBusy(false)
    }
  }

  const authorName = author ? profileDisplayName(author) : 'Member'

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => author && router.push(routes.profileOf(author.id))}
          accessibilityRole="button"
          accessibilityLabel={`${authorName} profile`}
        >
          <ProfileAvatar uri={avatarUri} border={author?.selected_border ?? null} size={40} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <TouchableOpacity onPress={() => author && router.push(routes.profileOf(author.id))}>
            <Text style={styles.authorName} numberOfLines={1}>{authorName}</Text>
          </TouchableOpacity>
          <Text style={styles.meta}>{formatPostTime(post.created_at)}</Text>
        </View>
      </View>

      <LinkedText text={post.body} style={styles.body} />
      {poll ? (
        <PollBlock
          postId={post.id}
          clubId={post.club_id}
          poll={poll}
          question={post.body}
          currentUserId={isClubMember ? currentUserId : null}
          isOwner={isClubOwner}
          memberName={memberName}
        />
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => void toggleLike()}
          disabled={!currentUserId || !isClubMember || likeBusy}
          style={styles.actionBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={likedByMe ? 'Unlike' : 'Like'}
        >
          {likeBusy ? (
            <Spinner size="small" color={theme.colors.primary} />
          ) : (
            <Ionicons
              name={likedByMe ? 'heart' : 'heart-outline'}
              size={20}
              color={likedByMe ? theme.colors.error : theme.colors.subtext}
            />
          )}
          <Text style={[styles.actionLabel, likedByMe && { color: theme.colors.error }]}>
            {likeCount === 0 ? 'Like' : String(likeCount)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setCommentsOpen(o => !o)}
          style={styles.actionBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={commentsOpen ? 'Hide comments' : 'Show comments'}
        >
          <Ionicons name="chatbubble-outline" size={18} color={theme.colors.subtext} />
          <Text style={styles.actionLabel}>
            {comments.length === 0 ? 'Comment' : `${comments.length}`}
          </Text>
        </TouchableOpacity>
      </View>

      {commentsOpen && (
        <View style={styles.commentsSection}>
          <ScrollView style={styles.commentsScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {comments.length === 0 ? (
              <Text style={shared.caption}>No comments yet.</Text>
            ) : (
              comments.map(c => (
                <ClubPostCommentLine key={c.id} comment={c} />
              ))
            )}
          </ScrollView>
          {currentUserId && isClubMember && (
            <View style={styles.commentComposer}>
              <TextInput
                value={commentDraft}
                onChangeText={setCommentDraft}
                placeholder="Write a comment…"
                placeholderTextColor={theme.colors.subtext}
                style={styles.commentInput}
                multiline
                maxLength={CLUB_POST_COMMENT_MAX}
                editable={!commentBusy}
              />
              <TouchableOpacity
                onPress={() => void submitComment()}
                disabled={commentBusy || !commentDraft.trim()}
                style={[styles.commentSend, (!commentDraft.trim() || commentBusy) && { opacity: 0.45 }]}
              >
                {commentBusy
                  ? <Spinner size="small" color={theme.colors.primary} />
                  : <Ionicons name="send" size={18} color={theme.colors.primary} />
                }
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

function ClubPostCommentLine({ comment }: { comment: ClubPostCommentWithAuthor }) {
  const router = useRouter()
  const p = comment.profiles
  const avatarUri = profileAvatarSmallUri(p?.avatar_url)

  const name = p ? profileDisplayName(p) : 'Member'

  return (
    <View style={styles.commentRow}>
      <TouchableOpacity onPress={() => router.push(routes.profileOf(comment.user_id))}>
        <ProfileAvatar uri={avatarUri} border={p?.selected_border ?? null} size={28} />
      </TouchableOpacity>
      <View style={{ flex: 1, minWidth: 0 }}>
        <TouchableOpacity onPress={() => router.push(routes.profileOf(comment.user_id))}>
          <Text style={styles.commentAuthor} numberOfLines={1}>{name}</Text>
        </TouchableOpacity>
        <LinkedText text={comment.body} style={styles.commentBody} />
        <Text style={styles.commentTime}>{formatPostTime(comment.created_at)}</Text>
      </View>
    </View>
  )
}

type ClubPostComposerModalProps = {
  visible: boolean
  clubId: string
  onClose: () => void
  onCreated: () => void
}

export function ClubPostComposerModal({ visible, clubId, onClose, onCreated }: ClubPostComposerModalProps) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  // Shown under the text box: this is a Modal, which on native sits above any toast (#228).
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const trimmed = body.trim()
    if (!trimmed) return
    const uid = (await getSessionUser())?.id
    if (!uid) {
      setError('Sign in to post.')
      return
    }
    if (trimmed.length > CLUB_POST_BODY_MAX) {
      setError(`Posts can be at most ${CLUB_POST_BODY_MAX} characters.`)
      return
    }
    setError(null)
    setBusy(true)
    try {
      const { error } = await supabase.from('club_posts').insert({
        club_id: clubId,
        created_by: uid,
        body: trimmed,
      })
      if (error) throw error
      setBody('')
      onCreated()
      onClose()
    } catch (e: unknown) {
      setError(isNetworkError(e) ? `Couldn't post. ${NETWORK_ERROR_MESSAGE}` : `Couldn't post. ${GENERIC_ERROR_MESSAGE}`)
    } finally {
      setBusy(false)
    }
  }

  function handleClose() {
    if (busy) return
    setBody('')
    setError(null)
    onClose()
  }

  const isWeb = Platform.OS === 'web'

  return (
    <Modal visible={visible} transparent animationType={isWeb ? 'fade' : 'slide'} onRequestClose={handleClose}>
      <View
        style={[
          styles.composerOverlay,
          isWeb ? styles.composerOverlayWeb : styles.composerOverlayNative,
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <KeyboardAvoidingView
          style={styles.composerKeyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={[styles.composerSheet, isWeb ? styles.composerSheetWeb : styles.composerSheetNative]}>
            <ScrollView
              style={styles.composerScroll}
              contentContainerStyle={styles.composerScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.composerHandleWrap}>
                {!isWeb && <View style={styles.composerHandle} />}
                <Text style={shared.subheading}>New club post</Text>
              </View>
              <Text style={[shared.caption, { marginBottom: theme.spacing.sm }]}>
                Visible to members of this club.
              </Text>
              <TextInput
                value={body}
                onChangeText={setBody}
                placeholder="Share an update…"
                placeholderTextColor={theme.colors.subtext}
                style={[shared.input, shared.inputMultiline, styles.composerInput]}
                multiline
                maxLength={CLUB_POST_BODY_MAX}
                editable={!busy}
                textAlignVertical="top"
                accessibilityLabel="Post"
              />
              {error ? <Text style={[shared.errorText, shared.mt_sm]} role="alert" testID="club-post-error">{error}</Text> : null}
              <View style={styles.composerActions}>
                <TouchableOpacity
                  onPress={handleClose}
                  disabled={busy}
                  style={[shared.buttonBase, shared.buttonSecondary, { flex: 1 }]}
                >
                  <Text style={shared.buttonLabelSecondary}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void submit()}
                  disabled={busy || !body.trim()}
                  style={[shared.buttonBase, shared.buttonPrimary, { flex: 1 }, (busy || !body.trim()) && shared.buttonDisabled]}
                >
                  {busy
                    ? <Spinner color={theme.colors.white} />
                    : <Text style={shared.buttonLabelPrimary}>Post</Text>
                  }
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadow.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  authorName: {
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.semibold,
    color: theme.colors.text,
  },
  meta: {
    fontSize: theme.font.size.xs,
    color: theme.colors.subtext,
    marginTop: 2,
  },
  body: {
    ...shared.body,
    lineHeight: 22,
    marginBottom: theme.spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: theme.spacing.xs,
  },
  actionLabel: {
    fontSize: theme.font.size.sm,
    color: theme.colors.subtext,
    fontWeight: theme.font.weight.medium,
  },
  commentsSection: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  commentsScroll: {
    maxHeight: 220,
    marginBottom: theme.spacing.sm,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  commentAuthor: {
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.semibold,
    color: theme.colors.text,
  },
  commentBody: {
    fontSize: theme.font.size.sm,
    color: theme.colors.text,
    marginTop: 2,
  },
  commentTime: {
    fontSize: theme.font.size.xs,
    color: theme.colors.subtext,
    marginTop: 4,
  },
  commentComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  commentInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    fontSize: theme.font.size.md,
  },
  commentSend: {
    padding: theme.spacing.sm,
    marginBottom: 4,
  },
  composerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  composerOverlayWeb: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  composerOverlayNative: {
    justifyContent: 'flex-end',
  },
  composerSheet: {
    backgroundColor: theme.colors.card,
    padding: theme.spacing.lg,
    width: '100%',
    ...theme.shadow.md,
  },
  composerSheetWeb: {
    maxWidth: 440,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  composerSheetNative: {
    height: '100%',
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
  },
  composerKeyboardAvoid: { width: '100%' },
  composerScroll: {
    flex: 1,
  },
  composerScrollContent: {
    flexGrow: 1,
  },
  composerHandleWrap: {
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  composerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.xs,
  },
  composerInput: {
    minHeight: 120,
    marginBottom: theme.spacing.md,
  },
  composerActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
})
