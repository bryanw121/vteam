import { useState } from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { Spinner } from '../ui/Spinner'
import { ClubPostCard, ClubPostComposerModal } from '../ClubPostCard'
import { PollComposerSheet } from './PollComposerSheet'
import { shared, theme } from '../../constants'
import type { ClubUpdatesProps } from '../../types'

const HIT = { top: 12, bottom: 12, left: 12, right: 12 }

/** "Club updates" (members only): owners post and start polls (#175); everyone reads, likes and comments. */
export function ClubUpdates({ clubId, posts, likedPostIds, loading, userId, member, owner, memberName, onChanged }: ClubUpdatesProps) {
  const [composer, setComposer] = useState<'post' | 'poll' | null>(null)
  return (
    <>
      <View style={shared.clubUpdatesHeader}>
        <Text style={shared.subheading}>Club updates</Text>
        {owner && (
          <View style={{ flexDirection: 'row', gap: theme.spacing.lg }}>
            <TouchableOpacity onPress={() => setComposer('poll')} hitSlop={HIT} accessibilityRole="button" testID="club-new-poll">
              <Text style={shared.clubLinkLabel}>New poll</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setComposer('post')} hitSlop={HIT} accessibilityRole="button" testID="club-new-post">
              <Text style={shared.clubLinkLabel}>New post</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      {loading ? (
        <Spinner color={theme.colors.primaryText} style={{ marginVertical: theme.spacing.lg }} />
      ) : posts.length === 0 ? (
        <View style={[shared.card, { marginHorizontal: theme.spacing.md, marginBottom: theme.spacing.md, alignItems: 'center', paddingVertical: theme.spacing.lg, gap: theme.spacing.sm }]}>
          <Text style={shared.caption}>No updates yet.</Text>
          {owner && (
            <TouchableOpacity onPress={() => setComposer('post')} accessibilityRole="button">
              <Text style={shared.clubLinkLabel}>Share the first post</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={{ paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.md }}>
          {posts.map(p => (
            <ClubPostCard
              key={p.id}
              post={p}
              likedByMe={likedPostIds.has(p.id)}
              currentUserId={userId}
              isClubMember={member}
              isClubOwner={owner}
              memberName={memberName}
              onDataChanged={onChanged}
            />
          ))}
        </View>
      )}
      <PollComposerSheet visible={composer === 'poll'} clubId={clubId} onClose={() => setComposer(null)} onCreated={onChanged} />
      <ClubPostComposerModal visible={composer === 'post'} clubId={clubId} onClose={() => setComposer(null)} onCreated={onChanged} />
    </>
  )
}
