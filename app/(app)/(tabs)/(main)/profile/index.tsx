import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Platform, Pressable, View } from 'react-native'
import { RefreshControl } from '../../../../../components/RefreshControl'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { DocScrollView } from '../../../../../components/DocScrollView'
import { Toast } from '../../../../../components/Toast'
import { SignInPrompt } from '../../../../../components/SignInPrompt'
import { ScreenState } from '../../../../../components/ui'
import { ProfileHero } from '../../../../../components/profile/ProfileHero'
import { ProfileMenu } from '../../../../../components/profile/ProfileMenu'
import { useTour } from '../../../../../contexts/tour'
import { EditProfileForm } from '../../../../../components/profile/EditProfileForm'
import { RecentCheersPlaceholder, TrophyCase } from '../../../../../components/profile/TrophyCase'
import { useAvatarUploader } from '../../../../../components/profile/useAvatarUploader'
import { PROFILE_TAB_INDEX, shared, theme } from '../../../../../constants'
import { useSession } from '../../../../../contexts/session'
import { useTabsActive, useTabsShell } from '../../../../../contexts/tabs'
import { badgesKey, useBadges } from '../../../../../hooks/useBadges'
import {
  myCheersCountKey,
  myProfileKey,
  useMyCheersCount,
  useMyProfile,
} from '../../../../../hooks/useMyProfile'
import { useFocusRefetch } from '../../../../../lib/query'
import { pointsBalanceKey, usePointsBalance } from '../../../../../hooks/usePoints'
import { routes } from '../../../../../utils/routes'
import type { Profile, ProfilePatch, ToastState, UserBadge } from '../../../../../types'

type Props = {
  profile: Profile
  totalCheers: number
  totalPoints: number
  badges: UserBadge[]
  saving: boolean
  updateProfile: (patch: ProfilePatch) => Promise<boolean>
  setDisplaySlot: ReturnType<typeof useBadges>['setDisplaySlot']
  checkBadges: ReturnType<typeof useBadges>['checkBadges']
  refreshing: boolean
  onRefresh: () => void
}

/** The loaded Profile tab: hero card, then either the settings menu or the edit form. */
function MyProfileBody({ profile, totalCheers, totalPoints, badges, saving, updateProfile, setDisplaySlot, checkBadges, refreshing, onRefresh }: Props) {
  const router = useRouter()
  const tour = useTour()
  const { setTabBarHidden, tabBarHeight, docScrollActive } = useTabsShell()
  const lastScrollY = useRef(0)
  const [section, setSection] = useState<'menu' | 'edit'>('menu')
  const [toast, setToast] = useState<ToastState | null>(null)

  const showToast = useCallback((message: string) => setToast({ message, variant: 'error' }), [])
  const onAvatarSaved = useCallback((updated: Profile) => { void checkBadges(updated, true) }, [checkBadges])
  const uploader = useAvatarUploader({ profile, updateProfile, onSaved: onAvatarSaved, onToast: showToast })

  // Hide the tab bar while editing.
  useEffect(() => {
    setTabBarHidden(section === 'edit')
    return () => { if (section === 'edit') setTabBarHidden(false) }
  }, [section, setTabBarHidden])

  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    if (Platform.OS !== 'web') return
    if (section === 'edit') return
    const y = e.nativeEvent.contentOffset.y
    const diff = y - lastScrollY.current
    lastScrollY.current = y
    if (y <= 60) { setTabBarHidden(false); return }
    if (Math.abs(diff) > 5) setTabBarHidden(diff > 0)
  }, [section, setTabBarHidden])

  async function handleSave(patch: ProfilePatch) {
    const saved = await updateProfile(patch)
    if (!saved) {
      Alert.alert('Error', 'Could not save profile. Please try again.')
      return
    }
    void checkBadges({ ...profile, ...patch }, true)
    Alert.alert('Saved', 'Your profile was updated.')
    setSection('menu')
  }

  const displayedBadges = [1, 2, 3]
    .map(slot => badges.find(b => b.display_order === slot))
    .filter((b): b is UserBadge => !!b)

  return (
    <View style={[shared.screen, { position: 'relative' }, docScrollActive && ({ flex: undefined } as object)]}>
      <DocScrollView
        docScroll={docScrollActive}
        contentContainerStyle={[shared.scrollContent, { paddingBottom: tabBarHeight + 32 }]}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {section === 'edit' && (
          <View style={{ alignItems: 'flex-start', marginBottom: theme.spacing.sm }}>
            <Pressable onPress={() => setSection('menu')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close editor">
              <Ionicons name="close" size={22} color={theme.colors.subtext} />
            </Pressable>
          </View>
        )}

        <ProfileHero
          profile={profile}
          uploader={uploader}
          mode={section}
          totalCheers={totalCheers}
          totalPoints={totalPoints}
          displayedBadges={displayedBadges}
          onEdit={() => setSection('edit')}
        />

        {section === 'menu' ? (
          <>
            <TrophyCase />
            <RecentCheersPlaceholder />
            <ProfileMenu
              onOpen={s => router.push(routes.settings(s))}
              onTakeTour={() => tour.start('intro', 'profile_menu')}
              onOpenTerms={() => router.push(routes.terms())}
              onOpenPrivacy={() => router.push(routes.privacy())}
            />
          </>
        ) : (
          <EditProfileForm
            profile={profile}
            badges={badges}
            saving={saving}
            onSave={patch => void handleSave(patch)}
            onSetBorder={border => void updateProfile({ selected_border: border })}
            onSetBadgeSlot={(type, slot, tier) => void setDisplaySlot(type, slot, tier)}
          />
        )}
      </DocScrollView>
      <Toast message={toast?.message ?? ''} variant={toast?.variant ?? 'error'} visible={!!toast} onHide={() => setToast(null)} />
    </View>
  )
}

/** Owns the data: profile, cheers count and badges, fetched only while this tab is the active one. */
function MyProfileSignedIn() {
  const { userId } = useSession()
  const { activeTabIndex } = useTabsActive()
  const isActive = activeTabIndex === PROFILE_TAB_INDEX
  const [refreshing, setRefreshing] = useState(false)

  const me = useMyProfile({ enabled: isActive })
  const cheers = useMyCheersCount({ enabled: isActive })
  const points = usePointsBalance(userId, { enabled: isActive })
  const { badges, checkBadges, fetchBadges, setDisplaySlot } = useBadges({ enabled: isActive })

  // Refetch on focus / foreground only while visible, and only when stale.
  useFocusRefetch(isActive && userId ? myProfileKey(userId) : null)
  useFocusRefetch(isActive && userId ? myCheersCountKey(userId) : null)
  useFocusRefetch(isActive && userId ? pointsBalanceKey(userId) : null)
  useFocusRefetch(isActive && userId ? badgesKey(userId) : null)

  // Award any newly earned badges (throttled inside checkBadges).
  const profile = me.profile
  useEffect(() => {
    if (isActive && profile) void checkBadges(profile)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run on tab activation / user change, not on every edit
  }, [isActive, profile?.id, checkBadges])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await Promise.all([me.refetch({ force: true }), cheers.refetch({ force: true }), points.refetch({ force: true }), fetchBadges(true)])
    } finally {
      setRefreshing(false)
    }
  }

  if (!profile) {
    return (
      <View style={shared.screen}>
        <ScreenState
          loading={me.isFetching || !me.error}
          error={me.error ? 'Could not load your profile. Check your connection and try again.' : null}
          onRetry={() => void me.refetch({ force: true })}
        />
      </View>
    )
  }

  return (
    <MyProfileBody
      profile={profile}
      totalCheers={cheers.data ?? 0}
      totalPoints={points.data ?? 0}
      badges={badges}
      saving={me.isSaving}
      updateProfile={me.updateProfile}
      setDisplaySlot={setDisplaySlot}
      checkBadges={checkBadges}
      refreshing={refreshing}
      onRefresh={() => void handleRefresh()}
    />
  )
}

/** Guests see a sign-in prompt; the signed-in screen (and its data hooks) only mounts with a session. */
export default function MyProfile() {
  const { userId, loading } = useSession()
  const tour = useTour()
  if (loading) return null
  if (!userId) {
    return (
      <SignInPrompt
        icon="person-circle-outline"
        title="Your volleyball profile"
        body="Sign in or sign up to track the events you play, your cheers and your badges."
        extra={{ label: 'Take the tour', onPress: () => tour.start('intro', 'profile_menu'), testID: 'take-tour' }}
      />
    )
  }
  return <MyProfileSignedIn />
}
