import { Platform, View, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { Text } from './ui/Text'
import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme, shared } from '../constants'
import { routes } from '../utils/routes'
import type { EventCommentWithAuthor } from '../types'
import { profileAvatarSmallUri, profileDisplayName, formatCommentTime } from '../utils'
import { ProfileAvatar } from './ProfileAvatar'

const SEGMENT_RE = /(https?:\/\/[^\s]+|@\w+)/g

function CommentBody({
  body,
  usernameToId,
}: {
  body: string
  usernameToId?: Map<string, string>
}) {
  const router = useRouter()
  const parts = body.split(SEGMENT_RE)

  return (
    <Text style={shared.body}>
      {parts.map((part, i) => {
        if (/^https?:\/\//.test(part)) {
          return (
            <Text
              key={i}
              style={styles.link}
              onPress={() => {
                if (Platform.OS === 'web') {
                  window.open(part, '_blank', 'noopener,noreferrer')
                } else {
                  void Linking.openURL(part)
                }
              }}
              accessibilityRole="link"
            >
              {part}
            </Text>
          )
        }
        if (/^@\w+$/.test(part) && usernameToId) {
          const username = part.slice(1)
          const profileId = usernameToId.get(username)
          if (profileId) {
            return (
              <Text
                key={i}
                style={styles.mention}
                onPress={() => router.push(routes.profileOf(profileId))}
                accessibilityRole="link"
                accessibilityLabel={`View profile of ${username}`}
              >
                {part}
              </Text>
            )
          }
        }
        return part
      })}
    </Text>
  )
}

type Props = {
  comment: EventCommentWithAuthor
  /** Replies to this comment (1-level deep, top-level only). */
  replies?: EventCommentWithAuthor[]
  usernameToId?: Map<string, string>
  myId?: string | null
  isHost?: boolean
  onReply?: (comment: EventCommentWithAuthor) => void
  onEdit?: (comment: EventCommentWithAuthor) => void
  onDelete?: (commentId: string) => void
  /** Indent level — 0 = top-level, 1 = reply. */
  indent?: number
}

export function EventCommentRow({
  comment,
  replies = [],
  usernameToId,
  myId,
  isHost,
  onReply,
  onEdit,
  onDelete,
  indent = 0,
}: Props) {
  const router = useRouter()
  const p = comment.profiles
  const avatarUri = profileAvatarSmallUri(p?.avatar_url)

  const name = p ? profileDisplayName(p) : 'Member'
  const isAnnouncement = comment.is_announcement && indent === 0
  const isOwn = myId && comment.user_id === myId
  const canDelete = isOwn || isHost
  const isDeleted = !!comment.deleted_at

  function goProfile() {
    router.push(routes.profileOf(comment.user_id))
  }

  function confirmDelete() {
    Alert.alert(
      'Delete comment?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete?.(comment.id) },
      ],
    )
  }

  if (isDeleted) {
    return (
      <View style={[styles.row, indent > 0 && styles.replyRow]}>
        {indent > 0 && <View style={styles.replyLine} />}
        <Text style={styles.deletedText}>Message deleted</Text>
        {/* still render replies to deleted comments */}
        {replies.length > 0 && (
          <View style={{ marginTop: 4 }}>
            {replies.map(r => (
              <EventCommentRow
                key={r.id}
                comment={r}
                usernameToId={usernameToId}
                myId={myId}
                isHost={isHost}
                onEdit={onEdit}
                onDelete={onDelete}
                indent={1}
              />
            ))}
          </View>
        )}
      </View>
    )
  }

  return (
    <View style={[styles.container, indent > 0 && styles.replyContainer]}>
      <View style={[styles.row, isAnnouncement && styles.rowAnnouncement]}>
        {indent > 0 && <View style={styles.replyLine} />}
        <TouchableOpacity onPress={goProfile} accessibilityRole="button" accessibilityLabel={`${name} profile`}>
          <ProfileAvatar uri={avatarUri} border={p?.selected_border ?? null} size={indent > 0 ? 28 : 36} />
        </TouchableOpacity>
        <View style={styles.content}>
          {isAnnouncement && (
            <View style={styles.announcementBadge}>
              <Text style={styles.announcementBadgeText}>Announcement</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <TouchableOpacity onPress={goProfile}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
            </TouchableOpacity>
            {/* Actions: edit + delete for own; delete for host */}
            {(isOwn || canDelete) && (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {isOwn && onEdit && (
                  <TouchableOpacity onPress={() => onEdit(comment)} hitSlop={8} style={styles.actionBtn}>
                    <Ionicons name="pencil-outline" size={13} color={theme.colors.subtext} />
                  </TouchableOpacity>
                )}
                {canDelete && onDelete && (
                  <TouchableOpacity onPress={confirmDelete} hitSlop={8} style={styles.actionBtn}>
                    <Ionicons name="trash-outline" size={13} color={theme.colors.subtext} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
          <CommentBody body={comment.body} usernameToId={usernameToId} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <Text style={styles.time}>
              {formatCommentTime(comment.created_at)}
              {comment.edited_at ? ' · edited' : ''}
            </Text>
            {indent === 0 && onReply && (
              <TouchableOpacity onPress={() => onReply(comment)} hitSlop={8}>
                <Text style={styles.replyBtn}>Reply</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* 1-level replies */}
      {replies.length > 0 && (
        <View style={styles.repliesContainer}>
          {replies.map(r => (
            <EventCommentRow
              key={r.id}
              comment={r}
              usernameToId={usernameToId}
              myId={myId}
              isHost={isHost}
              onEdit={onEdit}
              onDelete={onDelete}
              onReply={onReply}
              indent={1}
            />
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {},
  replyContainer: {
    marginLeft: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  replyRow: {
    paddingLeft: 0,
  },
  replyLine: {
    width: 2,
    alignSelf: 'stretch',
    backgroundColor: theme.colors.border,
    borderRadius: 1,
    marginRight: 6,
  },
  rowAnnouncement: {
    backgroundColor: theme.colors.announcementHighlight,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    marginVertical: theme.spacing.xxs,
  },
  announcementBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary + '22',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xxs,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.xs,
  },
  announcementBadgeText: {
    fontSize: theme.font.size.xs,
    fontWeight: theme.font.weight.semibold,
    color: theme.colors.primary,
    letterSpacing: 0.3,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xxs,
  },
  time: {
    fontSize: theme.font.size.sm,
    color: theme.colors.subtext,
  },
  replyBtn: {
    fontSize: theme.font.size.sm,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  link: {
    color: theme.colors.primary,
    textDecorationLine: 'underline',
  },
  mention: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  actionBtn: {
    padding: 4,
  },
  deletedText: {
    fontSize: theme.font.size.sm,
    color: theme.colors.subtext,
    fontStyle: 'italic',
    paddingVertical: 4,
    paddingLeft: 44,
  },
  repliesContainer: {
    marginTop: 2,
    marginLeft: 44,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.border,
    paddingLeft: 10,
  },
})
