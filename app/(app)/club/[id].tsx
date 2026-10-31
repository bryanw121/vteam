import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  Pressable,
  Platform,
  StyleSheet,
} from 'react-native'
import { Text, TextInput } from '../../../components/ui/Text'
import { RefreshControl } from '../../../components/RefreshControl'
import { LinearGradient } from 'expo-linear-gradient'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../../lib/supabase'
import { getQueryData, invalidate, queryKey, setQueryData, useFocusRefetch, useMutation } from '../../../lib/query'
import { useSession } from '../../../contexts/session'
import { useRequireSignIn } from '../../../hooks/useRequireSignIn'
import { clubDetailKey, clubPostsKey, useClubDetail, useClubPosts } from '../../../hooks/useClub'
import { myProfileKey } from '../../../hooks/useMyProfile'
import { shared, theme, CLUB_AVATARS_BUCKET } from '../../../constants'
import { resolveClubAvatarUri, profileDisplayName, confirmDestructive } from '../../../utils'
import { routes } from '../../../utils/routes'
import { EventCard } from '../../../components/EventCard'
import { MajorCityAutocomplete } from '../../../components/MajorCityAutocomplete'
import { ClubLocationField } from '../../../components/ClubLocationField'
import { ClubLocationCard } from '../../../components/ClubLocationCard'
import { clubLocationFromPicker, pickerFromClubLocation } from '../../../utils/clubLocation'
import { ClubPostCard, ClubPostComposerModal } from '../../../components/ClubPostCard'
import { ScreenState } from '../../../components/ui'
import type { ClubDetailData, ClubWithDetails, LocationValue, MajorCity, Profile } from '../../../types'

const COVER_HEIGHT = 200
const AVATAR_SIZE = 80
const AVATAR_OVERLAP = AVATAR_SIZE / 2

function MemberRow({ member }: { member: ClubWithDetails['club_members'][number] }) {
  const profile = member.profiles
  const displayName = profile ? profileDisplayName(profile) : 'Unknown'
  const initial = displayName.charAt(0).toUpperCase()

  return (
    <View style={styles.memberRow}>
      <View style={styles.memberInitial}>
        <Text style={styles.memberInitialText}>{initial}</Text>
      </View>
      <Text style={[shared.body, { flex: 1 }]} numberOfLines={1}>{displayName}</Text>
      {member.role === 'owner' && (
        <View style={styles.ownerBadge}>
          <Text style={styles.ownerBadgeText}>Owner</Text>
        </View>
      )}
    </View>
  )
}

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
  const upcomingEvents = detail.data?.upcomingEvents ?? []
  const pastCount = detail.data?.pastCount ?? 0
  const clubPosts = postsQuery.data?.posts ?? []
  const likedPostIds = useMemo(() => new Set(postsQuery.data?.likedPostIds ?? []), [postsQuery.data])

  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const [coverUri, setCoverUri] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editMajorCity, setEditMajorCity] = useState<MajorCity | null>(null)
  const [editLocation, setEditLocation] = useState<LocationValue | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pullRefreshing, setPullRefreshing] = useState(false)
  const [showPostComposer, setShowPostComposer] = useState(false)

  const coverPath = club?.cover_url ?? null
  const avatarPath = club?.avatar_url ?? null
  useEffect(() => {
    let cancelled = false
    void Promise.all([resolveClubAvatarUri(avatarPath), resolveClubAvatarUri(coverPath)]).then(([avatar, cover]) => {
      if (cancelled) return
      setAvatarUri(avatar)
      setCoverUri(cover)
    })
    return () => { cancelled = true }
  }, [avatarPath, coverPath])

  function goBack() {
    if (router.canGoBack()) router.back()
    else router.replace(routes.events())
  }

  async function handleClubRefresh() {
    setPullRefreshing(true)
    try {
      await Promise.all([detail.refetch({ force: true }), postsQuery.refetch({ force: true })])
    } finally {
      setPullRefreshing(false)
    }
  }

  /** The club changed (edit, new photo): refetch its page and the Clubs list. */
  function clubChanged() {
    invalidate(queryKey('club', id))
    invalidate('clubs')
  }

  const owner = !!club && !!userId && club.club_members.some(m => m.user_id === userId && m.role === 'owner')
  const member = !!club && !!userId && club.club_members.some(m => m.user_id === userId)

  // Join / leave: flips membership in the cached club at once and rolls back if the write fails.
  const membership = useMutation<'join' | 'leave', void>(
    async action => {
      if (!userId) throw new Error('Not signed in')
      const { error } =
        action === 'join'
          ? await supabase.from('club_members').insert({ club_id: id, user_id: userId, role: 'member' })
          : await supabase.from('club_members').delete().eq('club_id', id).eq('user_id', userId)
      if (error) throw error
    },
    {
      onMutate: action => {
        const key = clubDetailKey(id, userId)
        const before = getQueryData<ClubDetailData>(key)
        if (!before?.club || !userId) return
        const me = getQueryData<Profile>(myProfileKey(userId))
        const members: ClubWithDetails['club_members'] =
          action === 'join'
            ? [
                ...before.club.club_members,
                {
                  club_id: id,
                  user_id: userId,
                  role: 'member',
                  joined_at: new Date().toISOString(),
                  profiles: (me
                    ? { id: me.id, username: me.username, first_name: me.first_name, last_name: me.last_name, avatar_url: me.avatar_url }
                    : null) as ClubWithDetails['club_members'][number]['profiles'],
                },
              ]
            : before.club.club_members.filter(m => m.user_id !== userId)
        setQueryData<ClubDetailData>(key, { ...before, club: { ...before.club, club_members: members } })
        return () => setQueryData<ClubDetailData>(key, before)
      },
      onError: error => Alert.alert('Error', error.message),
      // Membership gates the updates feed and the Clubs tab's "Joined" list.
      invalidates: [queryKey('club', id), 'clubs'],
    },
  )

  function handleJoin() {
    if (!club) return
    if (!userId) { requireSignIn(); return }
    void membership.mutate('join')
  }

  function handleLeave() {
    if (!userId || !club) return
    confirmDestructive('Leave club', `Leave ${club.name}?`, 'Leave', () => void membership.mutate('leave'))
  }

  async function handleSaveEdit() {
    if (!club || !editName.trim()) {
      Alert.alert('Name required', 'Please enter a club name.')
      return
    }
    if (!editMajorCity) {
      Alert.alert('Metro area required', 'Choose a city from the list.')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('clubs')
      .update({
        name: editName.trim(),
        description: editDescription.trim() || null,
        major_city_id: editMajorCity.id,
        ...clubLocationFromPicker(editLocation),
      })
      .eq('id', club.id)
    setSaving(false)
    if (error) Alert.alert('Error', error.message)
    else { setEditMode(false); clubChanged() }
  }

  async function uploadFile(kind: 'avatar' | 'cover', file: Blob, mimeType: string) {
    if (!club) return
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
    const path = `${club.id}/${kind}_${Date.now()}.${ext}`
    const oldPath = kind === 'avatar' ? club.avatar_url : club.cover_url
    if (oldPath && !/^https?:\/\//i.test(oldPath)) {
      await supabase.storage.from(CLUB_AVATARS_BUCKET).remove([oldPath])
    }
    const { error: uploadError } = await supabase.storage
      .from(CLUB_AVATARS_BUCKET)
      .upload(path, file, { contentType: mimeType })
    if (uploadError) {
      Alert.alert('Upload failed', uploadError.message)
      return
    }
    const column = kind === 'avatar' ? 'avatar_url' : 'cover_url'
    const { error: updateError } = await supabase.from('clubs').update({ [column]: path }).eq('id', club.id)
    if (updateError) Alert.alert('Error', updateError.message)
    else clubChanged()
  }

  function pickAndUploadImage(kind: 'avatar' | 'cover') {
    if (!club) return

    if (Platform.OS === 'web') {
      // On mobile web (iOS Safari), programmatic file input clicks must happen
      // synchronously within the user gesture — any await before .click() kills it.
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return
        if (kind === 'avatar') setUploadingAvatar(true)
        else setUploadingCover(true)
        await uploadFile(kind, file, file.type || 'image/jpeg')
        if (kind === 'avatar') setUploadingAvatar(false)
        else setUploadingCover(false)
      }
      input.click()
      return
    }

    // Native: use expo-image-picker
    void (async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission required', 'Please allow access to your photo library.')
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: kind === 'avatar' ? [1, 1] : [3, 1],
        quality: 0.8,
      })
      if (result.canceled || !result.assets[0]) return
      if (kind === 'avatar') setUploadingAvatar(true)
      else setUploadingCover(true)
      const asset = result.assets[0]
      const mimeType = asset.mimeType ?? 'image/jpeg'
      const blob = await (await fetch(asset.uri)).blob()
      await uploadFile(kind, blob, mimeType)
      if (kind === 'avatar') setUploadingAvatar(false)
      else setUploadingCover(false)
    })()
  }

  async function confirmDeleteClub() {
    if (!club) return
    setDeleting(true)
    const { error } = await supabase.from('clubs').delete().eq('id', club.id)
    setDeleting(false)
    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    setShowDeleteModal(false)
    // Mark stale without refetching: this page is about to close, and a refetch
    // would briefly render "Club not found".
    invalidate(queryKey('club', club.id), { refetchActive: false })
    invalidate('clubs')
    goBack()
  }

  const memberCount = club?.club_members.length ?? 0
  const initial = club ? club.name.charAt(0).toUpperCase() : ''
  const foundedYear = club ? new Date(club.created_at).getFullYear() : ''

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {!club ? (
        <>
          <View style={{ paddingTop: Math.max(insets.top, theme.spacing.md) + theme.spacing.xs, paddingHorizontal: theme.spacing.md }}>
            <TouchableOpacity
              onPress={goBack}
              style={[styles.floatingBtn, { backgroundColor: theme.colors.card }]}
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
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={pullRefreshing} onRefresh={() => void handleClubRefresh()} tintColor={theme.colors.primary} />
          }
        >

          {/* ── Cover photo hero ── */}
          <View style={{ height: COVER_HEIGHT + AVATAR_OVERLAP, marginBottom: theme.spacing.sm }}>
            <View style={{ height: COVER_HEIGHT }}>
              {coverUri ? (
                <Image source={{ uri: coverUri }} style={[StyleSheet.absoluteFillObject, { pointerEvents: 'none' } as any]} resizeMode="cover" />
              ) : (
                <LinearGradient
                  colors={theme.gradients.brand}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[StyleSheet.absoluteFillObject, { pointerEvents: 'none' } as any]}
                />
              )}
              {/* Gradient fade at bottom for avatar contrast */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.18)']}
                style={[StyleSheet.absoluteFillObject, { top: COVER_HEIGHT * 0.5, pointerEvents: 'none' } as any]}
              />

              {/* Floating back button */}
              <View style={{
                position: 'absolute',
                top: Math.max(insets.top, theme.spacing.md) + theme.spacing.xs,
                left: theme.spacing.md,
                right: theme.spacing.md,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <TouchableOpacity onPress={goBack} style={styles.floatingBtn} hitSlop={12}>
                  <Ionicons name="chevron-back" size={20} color={theme.colors.white} />
                </TouchableOpacity>

                {owner && !editMode && (
                  <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                    <TouchableOpacity
                      onPress={() => {
                        if (!club) return
                        setEditName(club.name)
                        setEditDescription(club.description ?? '')
                        setEditMajorCity(club.major_cities ?? null)
                        setEditLocation(pickerFromClubLocation(club))
                        setEditMode(true)
                      }}
                      style={styles.floatingBtn}
                      hitSlop={12}
                    >
                      <Ionicons name="pencil-outline" size={18} color={theme.colors.white} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowDeleteModal(true)} style={[styles.floatingBtn, { backgroundColor: 'rgba(220,50,50,0.65)' }]} hitSlop={12}>
                      <Ionicons name="trash-outline" size={18} color={theme.colors.white} />
                    </TouchableOpacity>
                  </View>
                )}
                {editMode && (
                  <TouchableOpacity onPress={() => setEditMode(false)} style={styles.floatingBtn} hitSlop={12}>
                    <Ionicons name="close" size={20} color={theme.colors.white} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Cover photo edit button */}
              {owner && (
                <TouchableOpacity
                  onPress={() => pickAndUploadImage('cover')}
                  style={styles.coverEditBtn}
                  disabled={uploadingCover}
                >
                  {uploadingCover
                    ? <ActivityIndicator size="small" color={theme.colors.white} />
                    : <Ionicons name="camera-outline" size={14} color={theme.colors.white} />
                  }
                  <Text style={{ color: theme.colors.white, fontSize: theme.font.size.xs, fontWeight: theme.font.weight.semibold }}>
                    {coverUri ? 'Edit cover' : 'Add cover'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Club avatar — overlaps cover bottom */}
            <View style={{ alignItems: 'center', marginTop: -AVATAR_OVERLAP }} pointerEvents="box-none">
              <TouchableOpacity
                onPress={owner ? () => pickAndUploadImage('avatar') : undefined}
                activeOpacity={owner ? 0.8 : 1}
                style={{ position: 'relative' }}
              >
                <View style={styles.avatarRing}>
                  <View style={styles.avatar}>
                    {uploadingAvatar ? (
                      <ActivityIndicator color={theme.colors.primary} />
                    ) : avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }} resizeMode="cover" />
                    ) : (
                      <Text style={styles.avatarInitial}>{initial}</Text>
                    )}
                  </View>
                </View>
                {owner && (
                  <View style={styles.avatarCameraBtn}>
                    <Ionicons name="camera-outline" size={12} color={theme.colors.white} />
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Club name & meta ── */}
          <View style={{ alignItems: 'center', gap: theme.spacing.xs, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md }}>
            <Text style={{ fontSize: theme.font.size.xl, fontWeight: theme.font.weight.bold, color: theme.colors.text, textAlign: 'center' }}>
              {club.name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
              <View style={[styles.badge, club.membership_type === 'open' ? styles.badgeOpen : styles.badgeClosed]}>
                <Ionicons
                  name={club.membership_type === 'open' ? 'globe-outline' : 'lock-closed-outline'}
                  size={11}
                  color={club.membership_type === 'open' ? theme.colors.success : theme.colors.subtext}
                />
                <Text style={[styles.badgeText, { color: club.membership_type === 'open' ? theme.colors.success : theme.colors.subtext }]}>
                  {club.membership_type === 'open' ? 'Open' : 'Invite only'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="location-outline" size={12} color={theme.colors.subtext} />
                <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext }} numberOfLines={1}>
                  {club.major_cities?.display_name ?? 'Unknown'}
                </Text>
              </View>
              <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext }}>· Est. {foundedYear}</Text>
            </View>
          </View>

          {/* ── Stats ── */}
          <View style={[shared.card, styles.statsRow]}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{memberCount}</Text>
              <Text style={shared.caption}>{memberCount === 1 ? 'Member' : 'Members'}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{upcomingEvents.length}</Text>
              <Text style={shared.caption}>Upcoming</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{pastCount}</Text>
              <Text style={shared.caption}>Past</Text>
            </View>
          </View>

          {/* ── Join / Leave ── */}
          {userId && !owner && (
            <View style={{ paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.md }}>
              {member ? (
                <TouchableOpacity onPress={handleLeave} disabled={membership.isPending} style={[shared.buttonBase, shared.buttonSecondary, membership.isPending && shared.buttonDisabled]}>
                  {membership.isPending ? <ActivityIndicator color={theme.colors.primary} /> : <Text style={shared.buttonLabelSecondary}>Leave club</Text>}
                </TouchableOpacity>
              ) : club.membership_type === 'open' ? (
                <TouchableOpacity onPress={handleJoin} disabled={membership.isPending} style={[shared.buttonBase, shared.buttonPrimary, membership.isPending && shared.buttonDisabled]}>
                  {membership.isPending ? <ActivityIndicator color={theme.colors.white} /> : <Text style={shared.buttonLabelPrimary}>Join club</Text>}
                </TouchableOpacity>
              ) : (
                <View style={[shared.buttonBase, { backgroundColor: theme.colors.border }]}>
                  <Text style={{ color: theme.colors.subtext, fontSize: theme.font.size.md, fontWeight: theme.font.weight.medium }}>Invite only</Text>
                </View>
              )}
            </View>
          )}

          {/* ── Edit form ── */}
          {editMode && (
            <View style={[shared.card, { gap: theme.spacing.md, marginBottom: theme.spacing.md }]}>
              <Text style={shared.subheading}>Edit Club</Text>
              <View>
                <Text style={shared.label}>Name</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  style={shared.input}
                  placeholder="Club name"
                  placeholderTextColor={theme.colors.subtext}
                />
              </View>
              <View>
                <Text style={shared.label}>Description</Text>
                <TextInput
                  value={editDescription}
                  onChangeText={setEditDescription}
                  style={[shared.input, shared.inputMultiline]}
                  placeholder="What is this club about?"
                  placeholderTextColor={theme.colors.subtext}
                  multiline
                  numberOfLines={4}
                />
              </View>
              <ClubLocationField value={editLocation} onChange={setEditLocation} userId={userId} />
              <MajorCityAutocomplete label="Metro area" value={editMajorCity} onChange={setEditMajorCity} />
              <TouchableOpacity
                onPress={handleSaveEdit}
                disabled={saving}
                style={[shared.buttonBase, shared.buttonPrimary, saving && shared.buttonDisabled]}
              >
                {saving ? <ActivityIndicator color={theme.colors.white} /> : <Text style={shared.buttonLabelPrimary}>Save changes</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* ── Home court (#13) ── */}
          {!editMode && club.location_name ? (
            <ClubLocationCard club={club} />
          ) : null}

          {/* ── About ── */}
          {!editMode && club.description && (
            <View style={[shared.card, { marginBottom: theme.spacing.md, gap: theme.spacing.xs }]}>
              <Text style={shared.subheading}>About</Text>
              <Text style={[shared.body, { color: theme.colors.subtext, lineHeight: 22 }]}>{club.description}</Text>
            </View>
          )}

          {/* ── Club posts (members only) ── */}
          {member && !editMode && (
            <>
              <View style={{
                paddingHorizontal: theme.spacing.md,
                marginBottom: theme.spacing.sm,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: theme.spacing.md,
              }}>
                <Text style={shared.subheading}>Club updates</Text>
                {owner && (
                  <TouchableOpacity onPress={() => setShowPostComposer(true)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Text style={{
                      fontSize: theme.font.size.sm,
                      fontWeight: theme.font.weight.semibold,
                      color: theme.colors.primary,
                    }}>
                      New post
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              {postsQuery.isLoading ? (
                <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: theme.spacing.lg }} />
              ) : clubPosts.length === 0 ? (
                <View style={[shared.card, {
                  marginHorizontal: theme.spacing.md,
                  marginBottom: theme.spacing.md,
                  alignItems: 'center',
                  paddingVertical: theme.spacing.lg,
                  gap: theme.spacing.sm,
                }]}>
                  <Text style={shared.caption}>No updates yet.</Text>
                  {owner && (
                    <TouchableOpacity onPress={() => setShowPostComposer(true)}>
                      <Text style={{
                        fontSize: theme.font.size.sm,
                        fontWeight: theme.font.weight.semibold,
                        color: theme.colors.primary,
                      }}>
                        Share the first post
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={{ paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.md }}>
                  {clubPosts.map(p => (
                    <ClubPostCard
                      key={p.id}
                      post={p}
                      likedByMe={likedPostIds.has(p.id)}
                      currentUserId={userId}
                      isClubMember={member}
                      onDataChanged={() => { void postsQuery.refetch({ force: true }) }}
                    />
                  ))}
                </View>
              )}
              <ClubPostComposerModal
                visible={showPostComposer}
                clubId={club.id}
                onClose={() => setShowPostComposer(false)}
                onCreated={() => { void postsQuery.refetch({ force: true }) }}
              />
            </>
          )}

          {/* ── Upcoming Events ── */}
          <View style={{ paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.sm }}>
            <Text style={shared.subheading}>Upcoming Events</Text>
          </View>
          {upcomingEvents.length === 0 ? (
            <View style={[shared.card, { alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.md }]}>
              <Ionicons name="calendar-outline" size={28} color={theme.colors.subtext} />
              <Text style={shared.caption}>No upcoming events</Text>
            </View>
          ) : (
            <View style={{ marginBottom: theme.spacing.md }}>
              {upcomingEvents.map(event => <EventCard key={event.id} event={event} />)}
            </View>
          )}

          {/* ── Members ── */}
          <View style={{ paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.sm }}>
            <Text style={shared.subheading}>Members ({memberCount})</Text>
          </View>
          <View style={[shared.card, { paddingVertical: 0, paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.xl }]}>
            {club.club_members.length === 0 ? (
              <View style={{ paddingVertical: theme.spacing.md, alignItems: 'center' }}>
                <Text style={shared.caption}>No members yet</Text>
              </View>
            ) : (
              club.club_members.map(m => <MemberRow key={m.user_id} member={m} />)
            )}
          </View>

        </ScrollView>
      )}

      {/* Delete modal */}
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: theme.spacing.lg }}
          onPress={() => !deleting && setShowDeleteModal(false)}
        >
          <Pressable style={styles.deleteModal} onPress={() => {}}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <Ionicons name="trash-outline" size={22} color={theme.colors.error} />
              <Text style={{ fontSize: theme.font.size.lg, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>Delete club</Text>
            </View>
            <Text style={[shared.body, { color: theme.colors.subtext }]}>
              Are you sure you want to delete{' '}
              <Text style={{ fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>{club?.name}</Text>?
              {' '}This cannot be undone.
            </Text>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <TouchableOpacity
                onPress={() => setShowDeleteModal(false)}
                disabled={deleting}
                style={[shared.buttonBase, shared.buttonSecondary, { flex: 1 }]}
              >
                <Text style={shared.buttonLabelSecondary}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmDeleteClub}
                disabled={deleting}
                style={[shared.buttonBase, { flex: 1, backgroundColor: theme.colors.error, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', paddingVertical: theme.spacing.sm }]}
              >
                {deleting ? <ActivityIndicator color={theme.colors.white} /> : <Text style={{ color: theme.colors.white, fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold }}>Delete</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  floatingBtn: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: theme.radius.full,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEditBtn: {
    position: 'absolute',
    bottom: theme.spacing.sm,
    right: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  avatarRing: {
    width: AVATAR_SIZE + 6,
    height: AVATAR_SIZE + 6,
    borderRadius: (AVATAR_SIZE + 6) / 2,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadow.sm,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: theme.colors.primary + '22',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarInitial: {
    fontSize: theme.font.size.xxl,
    fontWeight: theme.font.weight.bold,
    color: theme.colors.primary,
  },
  avatarCameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.card,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
    borderWidth: 1,
  },
  badgeOpen: {
    backgroundColor: theme.colors.success + '18',
    borderColor: theme.colors.success + '44',
  },
  badgeClosed: {
    backgroundColor: theme.colors.subtext + '12',
    borderColor: theme.colors.border,
  },
  badgeText: {
    fontSize: theme.font.size.xs,
    fontWeight: theme.font.weight.medium,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.md,
  },
  statItem: {
    alignItems: 'center',
    gap: 3,
    flex: 1,
  },
  statNumber: {
    fontSize: theme.font.size.xl,
    fontWeight: theme.font.weight.bold,
    color: theme.colors.text,
  },
  statDivider: {
    width: 1,
    backgroundColor: theme.colors.border,
    alignSelf: 'stretch',
    marginVertical: theme.spacing.xs,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  memberInitial: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitialText: {
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.semibold,
    color: theme.colors.primary,
  },
  ownerBadge: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primary,
  },
  ownerBadgeText: {
    fontSize: theme.font.size.xs,
    fontWeight: theme.font.weight.semibold,
    color: theme.colors.white,
  },
  deleteModal: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    width: '100%',
    maxWidth: 360,
    gap: theme.spacing.md,
  },
})
