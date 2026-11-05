import { useState } from 'react'
import { Alert } from 'react-native'
import { supabase } from '../../lib/supabase'
import { useMutation } from '../../lib/query'
import { useRequireSignIn } from '../useRequireSignIn'
import { COMMENT_SELECT, GENERIC_ERROR_MESSAGE } from '../../constants'
import type { EventCommentPostVars as PostVars, EventCommentWithAuthor, EventCommentsPage } from '../../types'
import { eventKeys, patchQuery } from './keys'
import { reportEventError } from './telemetry'
import type { EventData } from '../../types'

export const EVENT_COMMENT_MAX_LEN = 2000

function upsertComment(id: string, row: EventCommentWithAuthor) {
  patchQuery<EventCommentsPage>(eventKeys.comments(id), page => {
    const idx = page.rows.findIndex(c => c.id === row.id)
    if (idx === -1) return { ...page, rows: [...page.rows, row] }
    const rows = [...page.rows]
    rows[idx] = row
    return { ...page, rows }
  })
}

/**
 * Discussion writes. Every write returns the row with `.select(COMMENT_SELECT)`
 * and patches the cached list in place — no refetch of the whole thread.
 *
 * `post` rejects on failure (after alerting) so `DiscussionComposer` keeps the
 * draft; it resolves once the comment is in the list.
 */
export function useEventComments(data: EventData, opts: { isHostOrCohost: boolean; onPosted?: () => void }) {
  const { id, userId } = data
  const requireSignIn = useRequireSignIn()
  const [replyTo, setReplyTo] = useState<EventCommentWithAuthor | null>(null)
  const [editing, setEditing] = useState<EventCommentWithAuthor | null>(null)

  const create = useMutation(
    async (vars: PostVars & { parentId: string | null }) => {
      if (!userId) throw new Error('Sign in to continue.')
      const { data: row, error } = await supabase
        .from('event_comments')
        .insert({
          event_id: id,
          user_id: userId,
          body: vars.body,
          is_announcement: Boolean(opts.isHostOrCohost && vars.isAnnouncement),
          mentions: vars.mentionIds,
          parent_id: vars.parentId,
        })
        .select(COMMENT_SELECT)
        .single()
      if (error) throw error
      return row as EventCommentWithAuthor
    },
    {
      onSuccess: row => upsertComment(id, row),
      onError: e => {
        reportEventError(id, userId, 'postComment', e)
        Alert.alert('Error', 'Could not post comment. Please try again.')
      },
    },
  )

  const update = useMutation(
    async (vars: { commentId: string; patch: { body?: string; edited_at?: string; deleted_at?: string } }) => {
      const { data: row, error } = await supabase
        .from('event_comments')
        .update(vars.patch)
        .eq('id', vars.commentId)
        .select(COMMENT_SELECT)
        .single()
      if (error) throw error
      return row as EventCommentWithAuthor
    },
    {
      onSuccess: row => upsertComment(id, row),
      onError: (e, vars) => {
        const isDelete = vars.patch.deleted_at !== undefined
        reportEventError(id, userId, isDelete ? 'deleteComment' : 'editComment', e)
        Alert.alert('Error', isDelete ? GENERIC_ERROR_MESSAGE : 'Could not edit comment.')
      },
    },
  )

  async function post(body: string, isAnnouncement: boolean, mentionIds: string[]): Promise<void> {
    // Guests can browse the event; acting on it needs an account.
    if (!userId) { requireSignIn(); return }
    if (body.length > EVENT_COMMENT_MAX_LEN) {
      Alert.alert('Comment too long', `Please keep comments under ${EVENT_COMMENT_MAX_LEN} characters.`)
      throw new Error('comment_too_long')
    }
    if (editing) {
      const row = await update.mutate({ commentId: editing.id, patch: { body, edited_at: new Date().toISOString() } })
      if (!row) throw new Error('comment_edit_failed')
      setEditing(null)
      return
    }
    const row = await create.mutate({ body, isAnnouncement, mentionIds, parentId: replyTo?.id ?? null })
    if (!row) throw new Error('comment_post_failed')
    setReplyTo(null)
    opts.onPosted?.()
  }

  /** Soft delete: the row stays (replies hang off it) with `deleted_at` set. */
  async function remove(commentId: string): Promise<void> {
    await update.mutate({ commentId, patch: { deleted_at: new Date().toISOString() } })
  }

  return {
    comments: data.comments,
    loading: data.commentsLoading,
    hasEarlier: data.hasEarlierComments,
    loadingEarlier: data.loadingEarlierComments,
    loadEarlier: data.loadEarlierComments,
    replyTo,
    setReplyTo,
    editing,
    setEditing,
    post,
    remove,
  }
}

