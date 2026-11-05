import React from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme } from '../../constants'
import { formatCommentTime, profileDisplayName } from '../../utils'
import { routes } from '../../utils/routes'
import type { TournamentCommentWithAuthor } from '../../types'
import { AutoAvatar } from './TournamentBits'

const SEGMENT_RE = /(https?:\/\/[^\s]+|@\w+)/g

/** Comment text with tappable @mentions that resolve to a known username. */
function CommentBody({ body, usernameToId }: { body: string; usernameToId: Map<string, string> }) {
  const router = useRouter()
  const parts = body.split(SEGMENT_RE)
  return (
    <Text style={{ fontSize: theme.font.size.md, color: theme.colors.text, lineHeight: 20 }}>
      {parts.map((part, i) => {
        if (/^@\w+$/.test(part)) {
          const uid = usernameToId.get(part.slice(1))
          if (uid) return (
            <Text key={i} style={{ color: theme.colors.primary, fontWeight: '600' }}
              onPress={() => router.push(routes.profileOf(uid))}>{part}</Text>
          )
        }
        return part
      })}
    </Text>
  )
}

type Props = {
  comment: TournamentCommentWithAuthor
  /** 0 = top level, 1 = a reply. */
  indent?: number
  replies?: TournamentCommentWithAuthor[]
  viewerId: string | null
  isOrganizer: boolean
  usernameToId: Map<string, string>
  onReply: (comment: TournamentCommentWithAuthor) => void
  onEdit: (comment: TournamentCommentWithAuthor) => void
  onDelete: (commentId: string) => void
}

export function CommentRow({ comment, indent = 0, replies = [], viewerId, isOrganizer, usernameToId, onReply, onEdit, onDelete }: Props) {
  const router = useRouter()
  const p = comment.profiles
  const name = p ? profileDisplayName(p) : 'Member'
  const isOwn = viewerId === comment.user_id
  const isDeleted = !!comment.deleted_at
  const openProfile = () => router.push(routes.profileOf(comment.user_id))

  return (
    <View style={{ marginLeft: indent > 0 ? 36 : 0 }}>
      {indent > 0 && <View style={{ position: 'absolute', left: -2, top: 0, bottom: 0, width: 2, backgroundColor: theme.colors.border, borderRadius: 1 }} />}
      {isDeleted ? (
        <Text style={{ fontSize: theme.font.size.smd, color: theme.colors.subtext, fontStyle: 'italic', paddingVertical: 4, paddingLeft: 40 }}>Message deleted</Text>
      ) : (
        <View style={[comment.is_announcement ? { backgroundColor: theme.colors.primary + '0D', borderRadius: 10, padding: 8, marginBottom: 4 } : { paddingVertical: 4 }]}>
          {comment.is_announcement && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Ionicons name="megaphone-outline" size={12} color={theme.colors.primary} />
              <Text style={{ fontSize: theme.font.size.xs, fontWeight: '700', color: theme.colors.primary, textTransform: 'uppercase', letterSpacing: 0.6 }}>Announcement</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <TouchableOpacity onPress={openProfile}>
              <AutoAvatar avatarUrl={p?.avatar_url} border={p?.selected_border} size={indent > 0 ? 26 : 32} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <TouchableOpacity onPress={openProfile}>
                  <Text style={{ fontSize: theme.font.size.smd, fontWeight: '600', color: theme.colors.text }}>{name}</Text>
                </TouchableOpacity>
                {(isOwn || isOrganizer) && (
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {isOwn && <TouchableOpacity hitSlop={8} accessibilityLabel="Edit comment" onPress={() => onEdit(comment)}><Ionicons name="pencil-outline" size={13} color={theme.colors.subtext} /></TouchableOpacity>}
                    <TouchableOpacity hitSlop={8} accessibilityLabel="Delete comment" onPress={() => onDelete(comment.id)}><Ionicons name="trash-outline" size={13} color={theme.colors.subtext} /></TouchableOpacity>
                  </View>
                )}
              </View>
              <CommentBody body={comment.body} usernameToId={usernameToId} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
                <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext }}>
                  {formatCommentTime(comment.created_at)}{comment.edited_at ? ' · edited' : ''}
                </Text>
                {indent === 0 && (
                  <TouchableOpacity hitSlop={8} onPress={() => onReply(comment)}>
                    <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.primary, fontWeight: '600' }}>Reply</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 1-level replies */}
      {replies.length > 0 && (
        <View style={{ marginLeft: 42, borderLeftWidth: 2, borderLeftColor: theme.colors.border, paddingLeft: 10, marginTop: 4 }}>
          {replies.map(r => (
            <CommentRow
              key={r.id}
              comment={r}
              indent={1}
              viewerId={viewerId}
              isOrganizer={isOrganizer}
              usernameToId={usernameToId}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </View>
      )}
    </View>
  )
}
