import React, { useMemo, useState } from 'react'
import { TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RefreshControl } from '../../../components/RefreshControl'
import { DocScrollView } from '../../../components/DocScrollView'
import { ClubLocationCard } from '../../../components/ClubLocationCard'
import { ClubHero } from '../../../components/club/ClubHero'
import { ClubSummary } from '../../../components/club/ClubSummary'
import { ClubMembershipBar } from '../../../components/club/ClubMembershipBar'
import { ClubEditForm } from '../../../components/club/ClubEditForm'
import { ClubUpdates } from '../../../components/club/ClubUpdates'
import { ClubEvents, ClubMembersList } from '../../../components/club/ClubMembersList'
import { ConfirmDialog, ScreenState } from '../../../components/ui'
import { Text } from '../../../components/ui/Text'
import { invalidate, queryKey, useFocusRefetch } from '../../../lib/query'
import { useSession } from '../../../contexts/session'
import { useRequireSignIn } from '../../../hooks/useRequireSignIn'
import { clubDetailKey, clubPostsKey, useClubDetail, useClubPosts } from '../../../hooks/useClub'
import { useClubGameAlerts, useClubMembership } from '../../../hooks/club/useClubMembership'
import { useClubEdit } from '../../../hooks/club/useClubEdit'
import { useClubMedia } from '../../../hooks/club/useClubMedia'
import { useDeleteClub } from '../../../hooks/club/useDeleteClub'
import { memberNameLookup } from '../../../utils/clubForm'
import { confirmDestructive, profileDisplayName } from '../../../utils'
import { routes } from '../../../utils/routes'
import { shared, theme } from '../../../constants'

/**
 * A club's page. Composes the club hooks (`hooks/club/`) and sections
 * (`components/club/`); the pure rules are in `utils/clubForm.ts` (#305).
 */
export default function ClubDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { userId } = useSession()
  const requireSignIn = useRequireSignIn()

  // Header + events and the updates feed are separate cache entries so their
  // requests overlap on a cold open; each refetches alone.
  const detail = useClubDetail(id)
  const postsQuery = useClubPosts(id)
  useFocusRefetch(clubDetailKey(id, userId))
  useFocusRefetch(userId ? clubPostsKey(id, userId) : null)
  const club = detail.data?.club ?? null
  const posts = postsQuery.data?.posts ?? []
  const likedPostIds = useMemo(() => new Set(postsQuery.data?.likedPostIds ?? []), [postsQuery.data])
  const [pullRefreshing, setPullRefreshing] = useState(false)

  const owner = !!club && !!userId && club.club_members.some(m => m.user_id === userId && m.role === 'owner')
  const member = !!club && !!userId && club.club_members.some(m => m.user_id === userId)
  const alertsOn = club?.club_members.find(m => m.user_id === userId)?.game_alerts ?? true
  const memberName = useMemo(() => memberNameLookup(club, profileDisplayName), [club])

  function goBack() {
    if (router.canGoBack()) router.back()
    else router.replace(routes.events())
  }

  /** The club changed (edit, new photo): refetch its page and the Clubs list. */
  function clubChanged() {
    invalidate(queryKey('club', id))
    invalidate('clubs')
  }

  const membership = useClubMembership(id)
  const alerts = useClubGameAlerts(id, club?.name)
  const edit = useClubEdit(club, clubChanged)
  const media = useClubMedia(club, clubChanged)
  const deletion = useDeleteClub(id, goBack)
  const refetchPosts = () => { void postsQuery.refetch({ force: true }) }

  async function refresh() {
    setPullRefreshing(true)
    try {
      await Promise.all([detail.refetch({ force: true }), postsQuery.refetch({ force: true })])
    } finally {
      setPullRefreshing(false)
    }
  }

  function join() {
    if (!club) return
    if (!userId) { requireSignIn(); return }
    void membership.mutate('join')
  }

  function leave() {
    if (!userId || !club) return
    confirmDestructive('Leave club', `Leave ${club.name}?`, 'Leave', () => void membership.mutate('leave'))
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {!club ? (
        <>
          <View style={{ paddingTop: Math.max(insets.top, theme.spacing.md) + theme.spacing.xs, paddingHorizontal: theme.spacing.md }}>
            <TouchableOpacity
              onPress={goBack}
              style={[shared.clubFloatingBtn, { backgroundColor: theme.colors.card }]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <ScreenState
            loading={detail.isFetching || !detail.error}
            error={detail.error ? 'Could not load this club. Check your connection and try again.' : null}
            onRetry={() => void detail.refetch({ force: true })}
            empty={!!detail.data}
            emptyIcon="people-outline"
            emptyTitle="Club not found"
          />
        </>
      ) : (
        <DocScrollView
          docScroll={false}
          memoryKey={`club:${id}`}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={() => void refresh()} tintColor={theme.colors.primary} />}
        >
          <ClubHero
            club={club}
            coverUri={media.coverUri}
            avatarUri={media.avatarUri}
            topInset={insets.top}
            owner={owner}
            editing={edit.editing}
            uploading={media.uploading}
            onBack={goBack}
            onEdit={edit.start}
            onCancelEdit={edit.cancel}
            onDelete={deletion.open}
            onPickImage={media.pick}
          />
          <ClubSummary club={club} upcomingCount={detail.data?.upcomingEvents.length ?? 0} pastCount={detail.data?.pastCount ?? 0} />

          {userId && (member || !owner) && (
            <ClubMembershipBar
              club={club}
              owner={owner}
              member={member}
              alertsOn={alertsOn}
              membershipBusy={membership.isPending}
              alertsBusy={alerts.isPending}
              onJoin={join}
              onLeave={leave}
              onToggleAlerts={() => void alerts.mutate(!alertsOn)}
            />
          )}

          {edit.editing ? (
            <ClubEditForm form={edit.form} errors={edit.errors} saving={edit.saving} userId={userId} nameRef={edit.nameRef} onChange={edit.change} onSave={() => void edit.save()} />
          ) : (
            <>
              {club.location_name ? <ClubLocationCard club={club} /> : null}
              {club.description ? (
                <View style={[shared.card, { marginBottom: theme.spacing.md, gap: theme.spacing.xs }]}>
                  <Text style={shared.subheading}>About</Text>
                  <Text style={[shared.body, { color: theme.colors.subtext, lineHeight: 22 }]}>{club.description}</Text>
                </View>
              ) : null}
              {member && (
                <ClubUpdates
                  clubId={club.id}
                  posts={posts}
                  likedPostIds={likedPostIds}
                  loading={postsQuery.isLoading}
                  userId={userId}
                  member={member}
                  owner={owner}
                  memberName={memberName}
                  onChanged={refetchPosts}
                />
              )}
            </>
          )}

          <ClubEvents events={detail.data?.upcomingEvents ?? []} />
          <ClubMembersList members={club.club_members} />
        </DocScrollView>
      )}

      <ConfirmDialog
        visible={deletion.visible}
        title="Delete club"
        body={`Delete ${club?.name ?? 'this club'}? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deletion.deleting}
        onConfirm={() => void deletion.confirm()}
        onCancel={deletion.close}
        testIDPrefix="club-delete-dialog"
      />
    </View>
  )
}
