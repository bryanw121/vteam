/**
 * Shared discussion composer used across event comments, tournament discussion, and club chat.
 * Handles @mention autocomplete, reply-to banner, edit mode, and host announcement toggle.
 */
import React, { useMemo, useRef, useState } from 'react'
import { Platform, ScrollView, Switch, TouchableOpacity, View } from 'react-native'
import { Text } from './ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Input } from './Input'
import { theme } from '../constants'
import type { MentionUser } from '../types'
import { Spinner } from './ui/Spinner'

export type DiscussionComposerProps = {
  /** User IDs/names available for @mention autocomplete. Pass [] to disable mentions. */
  mentionableUsers: MentionUser[]
  /** Called when the user submits a comment. */
  onPost: (body: string, isAnnouncement: boolean, mentionIds: string[]) => Promise<void>
  /** If true, show a "Reply to X" banner above the input. */
  replyToAuthor?: string | null
  onClearReply?: () => void
  /** If set, the composer is pre-filled for editing this text (announcement toggle hidden). */
  editingBody?: string | null
  onCancelEdit?: () => void
  /** Show the announcement toggle (only for hosts/organizers). */
  showAnnouncementToggle?: boolean
  announcementLabel?: string
  placeholder?: string
  onFocusScroll?: () => void
}

export function DiscussionComposer({
  mentionableUsers,
  onPost,
  replyToAuthor,
  onClearReply,
  editingBody,
  onCancelEdit,
  showAnnouncementToggle = false,
  announcementLabel = 'Post as announcement',
  placeholder = 'Add a comment…',
  onFocusScroll,
}: DiscussionComposerProps) {
  const isEditing = editingBody != null
  const [draft, setDraft] = useState(editingBody ?? '')
  const [isAnnouncement, setIsAnnouncement] = useState(false)
  const [posting, setPosting] = useState(false)
  const [activeMention, setActiveMention] = useState<{ query: string; atIndex: number } | null>(null)
  const cursorPosRef = useRef(0)

  // Re-sync draft when editingBody changes (e.g. user switches to a different edit target)
  const prevEditingBodyRef = useRef(editingBody)
  if (editingBody !== prevEditingBodyRef.current) {
    prevEditingBodyRef.current = editingBody
    setDraft(editingBody ?? '')
    setActiveMention(null)
  }

  const suggestions = useMemo(() => {
    if (!activeMention || mentionableUsers.length === 0) return []
    const q = activeMention.query.toLowerCase()
    return mentionableUsers
      .filter(u => !q || u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
      .slice(0, 6)
  }, [activeMention, mentionableUsers])

  function detectMention(text: string, cursor: number) {
    if (mentionableUsers.length === 0) return
    const before = text.slice(0, cursor)
    const match = before.match(/(^|\s)@(\w*)$/)
    if (match) {
      setActiveMention({ query: match[2], atIndex: before.lastIndexOf('@') })
    } else {
      setActiveMention(null)
    }
  }

  function handleDraftChange(text: string) {
    setDraft(text)
    detectMention(text, cursorPosRef.current)
  }

  function handleSelectionChange(e: any) {
    const pos: number = e.nativeEvent.selection.start
    cursorPosRef.current = pos
    detectMention(draft, pos)
  }

  function selectMention(user: MentionUser) {
    if (!activeMention) return
    const before = draft.slice(0, activeMention.atIndex)
    const after = draft.slice(cursorPosRef.current)
    const newDraft = `${before}@${user.username} ${after}`
    setDraft(newDraft)
    cursorPosRef.current = activeMention.atIndex + user.username.length + 2
    setActiveMention(null)
  }

  async function handlePost() {
    const body = draft.trim()
    if (!body || posting) return
    const mentionIds = mentionableUsers.length > 0
      ? [...new Set(
          [...body.matchAll(/@(\w+)/g)]
            .map(m => mentionableUsers.find(u => u.username === m[1])?.id)
            .filter((id): id is string => Boolean(id)),
        )]
      : []
    setPosting(true)
    try {
      await onPost(body, isAnnouncement && !isEditing, mentionIds)
      setDraft('')
      setIsAnnouncement(false)
      setActiveMention(null)
    } catch {
      // parent shows error; keep draft
    } finally {
      setPosting(false)
    }
  }

  return (
    <>
      {/* Edit mode banner */}
      {isEditing && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 12, paddingVertical: 6,
          backgroundColor: theme.colors.primary + '14',
          borderRadius: 8, marginBottom: 6,
        }}>
          <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.primaryText, flex: 1 }}>Editing comment</Text>
          <TouchableOpacity onPress={onCancelEdit} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Reply-to banner */}
      {!isEditing && replyToAuthor && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 12, paddingVertical: 6,
          backgroundColor: theme.colors.card,
          borderLeftWidth: 3, borderLeftColor: theme.colors.primary,
          borderRadius: 4, marginBottom: 6,
        }}>
          <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext, flex: 1 }} numberOfLines={1}>
            Replying to <Text style={{ fontWeight: '600', color: theme.colors.text }}>{replyToAuthor}</Text>
          </Text>
          <TouchableOpacity onPress={onClearReply} hitSlop={8}>
            <Ionicons name="close" size={16} color={theme.colors.subtext} />
          </TouchableOpacity>
        </View>
      )}

      {/* Announcement toggle */}
      {showAnnouncementToggle && !isEditing && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext, flex: 1, paddingRight: 8 }}>
            {announcementLabel}
          </Text>
          <Switch
            accessibilityLabel={announcementLabel}
            value={isAnnouncement}
            onValueChange={setIsAnnouncement}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary + '99' }}
            thumbColor={isAnnouncement ? theme.colors.white : theme.colors.card}
            ios_backgroundColor={theme.colors.border}
          />
        </View>
      )}

      {/* @mention suggestions */}
      {suggestions.length > 0 && (
        <View style={{
          borderWidth: 1, borderColor: theme.colors.border,
          borderRadius: 10, backgroundColor: theme.colors.card,
          marginBottom: 6, overflow: 'hidden', maxHeight: 220,
        }}>
          <ScrollView keyboardShouldPersistTaps="always" bounces={false}>
            {suggestions.map((u, idx) => (
              <TouchableOpacity
                key={u.id}
                onPress={() => selectMention(u)}
                accessibilityRole="button"
                accessibilityLabel={`Mention ${u.displayName}`}
                style={{
                  paddingHorizontal: 14, paddingVertical: 10,
                  borderBottomWidth: idx < suggestions.length - 1 ? 1 : 0,
                  borderBottomColor: theme.colors.border,
                  minHeight: 44, justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: theme.font.size.md, fontWeight: '600', color: theme.colors.text }}>
                  {u.displayName}
                </Text>
                <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>@{u.username}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Input row */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Input
            value={draft}
            onChangeText={handleDraftChange}
            onSelectionChange={handleSelectionChange}
            placeholder={placeholder}
            multiline
            numberOfLines={4}
            blurOnSubmit={false}
            containerStyle={{ marginBottom: 0 }}
            inputStyle={{
              minHeight: 44,
              maxHeight: 120,
              paddingHorizontal: 12,
              ...Platform.select({
                ios: { paddingTop: 12, paddingBottom: 8 },
                android: { paddingTop: 8, paddingBottom: 8, textAlignVertical: 'bottom' },
                default: { paddingVertical: 8 },
              }),
            }}
            onFocus={() => { if (onFocusScroll) requestAnimationFrame(onFocusScroll) }}
            includeFontPadding={Platform.OS === 'android' ? false : undefined}
          />
        </View>
        <TouchableOpacity
          onPress={handlePost}
          disabled={!draft.trim() || posting}
          accessibilityRole="button"
          accessibilityLabel={isEditing ? 'Save edit' : 'Send comment'}
          style={{
            width: 44, height: 44,
            borderRadius: 10,
            backgroundColor: theme.colors.primary,
            alignItems: 'center', justifyContent: 'center',
            opacity: !draft.trim() || posting ? 0.4 : 1,
          }}
        >
          {posting
            ? <Spinner size="small" color={theme.colors.white} />
            : <Ionicons name={isEditing ? 'checkmark' : 'send'} size={20} color={theme.colors.white} />}
        </TouchableOpacity>
      </View>
    </>
  )
}
