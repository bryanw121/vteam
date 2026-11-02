import React, { useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import { Text } from '../../../../components/ui/Text'
import { RefreshControl } from '../../../../components/RefreshControl'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusRefetch } from '../../../../lib/query'
import { useSession } from '../../../../contexts/session'
import { BadgeIcon } from '../../../../components/BadgeIcon'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { BorderSwatch } from '../../../../components/profile/BorderSwatch'
import { badgesKey, useBadges } from '../../../../hooks/useBadges'
import { myProfileKey, useMyProfile } from '../../../../hooks/useMyProfile'
import {
  shared,
  theme,
  BADGE_DEFINITIONS,
  BADGE_CATEGORY_GRADIENTS,
  BREAKPOINTS,
  PROFILE_BORDERS,
  isBorderUnlocked,
  badgeTitle,
} from '../../../../constants'
import { ScreenState } from '../../../../components/ui'
import type { UserBadge } from '../../../../types'
import type { ProfileBorderType, BadgeDef } from '../../../../constants'

export default function BadgesScreen() {
  useStackBackTitle('Badges')

  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const cols = width >= BREAKPOINTS.sidebar ? 6 : 4

  const { userId } = useSession()
  const { badges, loading, fetchBadges } = useBadges()
  const me = useMyProfile()
  const selectedBorder: ProfileBorderType | null = me.profile?.selected_border ?? null
  const [detailDef, setDetailDef] = useState<BadgeDef | null>(null)
  const [detailMounted, setDetailMounted] = useState(false)
  const [listRefreshing, setListRefreshing] = useState(false)
  const detailProgress = useSharedValue(0)

  const detailTranslateStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - detailProgress.value) * 400 }],
  }))
  const detailBackdropStyle = useAnimatedStyle(() => ({
    opacity: detailProgress.value,
  }))

  function openDetail(def: BadgeDef) {
    setDetailDef(def)
    setDetailMounted(true)
    detailProgress.value = 0
    detailProgress.value = withTiming(1, { duration: 280 })
  }

  function closeDetail() {
    detailProgress.value = withTiming(0, { duration: 220 }, (finished) => {
      'worklet'
      if (finished) {
        runOnJS(setDetailMounted)(false)
        runOnJS(setDetailDef)(null)
      }
    })
  }

  // Both lists refetch on focus only when stale (badges are written server-side, rarely).
  useFocusRefetch(userId ? badgesKey(userId) : null)
  useFocusRefetch(userId ? myProfileKey(userId) : null)

  async function handleBadgesRefresh() {
    setListRefreshing(true)
    try {
      await Promise.all([fetchBadges(true), me.refetch({ force: true })])
    } finally {
      setListRefreshing(false)
    }
  }

  function saveBorder(border: ProfileBorderType | null) {
    if (me.isSaving) return
    void me.updateProfile({ selected_border: border })
  }

  const earnedBadges = badges.filter(b => b.tier > 0)

  if ((loading && badges.length === 0) || !me.profile) {
    return (
      <View style={[shared.screen, shared.centered]}>
        <ScreenState
          loading={me.isFetching || !me.error}
          error={me.error ? 'Could not load your badges. Check your connection and try again.' : null}
          onRetry={() => void handleBadgesRefresh()}
        />
      </View>
    )
  }

  const detailBadge = detailDef ? badges.find(b => b.badge_type === detailDef.type) : null

  return (
    <View style={shared.screen}>
      <ScrollView
        contentContainerStyle={[shared.scrollContentSubpage, detailMounted ? { paddingBottom: 260 + insets.bottom } : undefined]}
        refreshControl={
          <RefreshControl refreshing={listRefreshing} onRefresh={() => void handleBadgesRefresh()} tintColor={theme.colors.primary} />
        }
      >

        {/* ── All badges grid ── */}
        <View style={shared.card}>
          <View style={[shared.rowBetween, { marginBottom: theme.spacing.md }]}>
            <Text style={shared.subheading}>Your Badges</Text>
            <Text style={[shared.caption, { color: theme.colors.subtext }]}>
              {earnedBadges.length} / {BADGE_DEFINITIONS.length}
            </Text>
          </View>

          <View testID="badges-grid" style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {BADGE_DEFINITIONS.map(def => {
              const badge = badges.find(b => b.badge_type === def.type)
              const isSelected = detailDef?.type === def.type
              return (
                <Pressable
                  key={def.type}
                  onPress={() => {
                    if (isSelected) { closeDetail(); return }
                    openDetail(def)
                  }}
                  style={({ pressed }) => ({
                    width: `${100 / cols}%` as any,
                    alignItems: 'center',
                    paddingVertical: theme.spacing.md,
                    paddingHorizontal: theme.spacing.xs,
                    opacity: pressed ? 0.7 : 1,
                    transform: [{ scale: pressed ? 0.94 : 1 }],
                    backgroundColor: isSelected ? theme.colors.primary + '0F' : 'transparent',
                    borderRadius: theme.radius.md,
                  })}
                >
                  <BadgeIcon def={def} tier={badge?.tier} size="sm" showLabel />
                </Pressable>
              )
            })}
          </View>
        </View>

        {/* ── Profile border ── */}
        <View style={[shared.card, { marginTop: theme.spacing.md }]}>
          <Text style={[shared.subheading, { marginBottom: theme.spacing.xs }]}>Profile Border</Text>
          <Text style={[shared.caption, { marginBottom: theme.spacing.md }]}>
            Unlock borders by earning attendance badges.
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg }}>
            <BorderSwatch
              label="None"
              size="lg"
              unlocked
              selected={!selectedBorder}
              onPress={() => saveBorder(null)}
              disabled={me.isSaving}
            />
            {PROFILE_BORDERS.map(border => (
              <BorderSwatch
                key={border.type}
                label={border.label}
                size="lg"
                borderDef={border}
                unlocked={isBorderUnlocked(border, badges)}
                selected={selectedBorder === border.type}
                description={border.description}
                onPress={() => saveBorder(border.type)}
                disabled={me.isSaving}
              />
            ))}
          </View>
        </View>

      </ScrollView>

      {/* ── Badge detail panel + backdrop (Modal covers header + tab bar) ── */}
      <Modal
        visible={detailMounted && !!detailDef}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={closeDetail}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }, detailBackdropStyle]}>
          <Pressable
            style={{ flex: 1 }}
            onPress={closeDetail}
            accessibilityRole="button"
            accessibilityLabel="Close badge details"
          />
        </Animated.View>
        {detailDef && (
          <BadgeDetailPanel
            def={detailDef}
            badge={detailBadge ?? null}
            onClose={closeDetail}
            bottomInset={insets.bottom}
            animStyle={detailTranslateStyle}
          />
        )}
      </Modal>
    </View>
  )
}

// ─── Badge detail panel ───────────────────────────────────────────────────────

type BadgeDetailPanelProps = {
  def: BadgeDef
  badge: UserBadge | null
  onClose: () => void
  bottomInset: number
  animStyle: ReturnType<typeof useAnimatedStyle>
}

function BadgeDetailPanel({ def, badge, onClose, bottomInset, animStyle }: BadgeDetailPanelProps) {
  const earnedTier = badge?.tier ?? 0
  const [topColor] = BADGE_CATEGORY_GRADIENTS[def.type] ?? ['#888', '#444']
  const isSingleTier = def.tiers.length === 1

  const statUnit: Record<string, string> = {
    events_attended_past: 'events attended',
    events_hosted_past:   'events hosted',
    cheers_received_total:'cheers received',
    cheers_given_events:  'events where you gave cheers',
    spike_cheers:         'spike cheers',
    serve_cheers:         'serve cheers',
    block_cheers:         'block cheers',
    set_cheers:           'set cheers',
    dig_pass_cheers:      'dig/pass cheers',
    communication_cheers: 'communication cheers',
  }
  const unit = statUnit[def.stat]

  return (
    <Animated.View style={[{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: theme.colors.card,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      paddingTop: theme.spacing.sm,
      paddingBottom: bottomInset + theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
      shadowColor: theme.colors.black,
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 16,
    }, animStyle]}>
      {/* Handle */}
      <View style={{ alignItems: 'center', marginBottom: theme.spacing.sm }}>
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.border }} />
      </View>

      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
        <BadgeIcon def={def} tier={earnedTier > 0 ? earnedTier : undefined} size="lg" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: theme.font.size.lg, fontWeight: theme.font.weight.bold, color: theme.colors.text }}>
            {badgeTitle(def.type)}
          </Text>
          <Text style={[shared.caption, { color: theme.colors.subtext, marginTop: 2 }]} numberOfLines={2}>
            {def.description}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close-circle" size={24} color={theme.colors.subtext} />
        </Pressable>
      </View>

      {/* Tier list */}
      {isSingleTier ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xs }}>
          <Ionicons
            name={earnedTier > 0 ? 'checkmark-circle' : 'ellipse-outline'}
            size={18}
            color={earnedTier > 0 ? topColor : theme.colors.border}
          />
          <Text style={{ fontSize: theme.font.size.sm, color: earnedTier > 0 ? theme.colors.text : theme.colors.subtext, flex: 1 }}>
            {def.tiers[0].label}
          </Text>
          {earnedTier > 0 && (
            <Text style={{ fontSize: theme.font.size.xs, color: topColor, fontWeight: theme.font.weight.semibold }}>
              Earned
            </Text>
          )}
        </View>
      ) : (
        <View style={{ gap: theme.spacing.xs }}>
          {def.tiers.map(t => {
            const earned = earnedTier >= t.tier
            return (
              <View key={t.tier} style={{
                flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
                paddingVertical: 5,
                paddingHorizontal: theme.spacing.sm,
                borderRadius: theme.radius.sm,
                backgroundColor: earned ? topColor + '12' : 'transparent',
              }}>
                <Ionicons
                  name={earned ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={earned ? topColor : theme.colors.border}
                />
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                  <Text style={{
                    fontSize: theme.font.size.sm,
                    fontWeight: earned ? theme.font.weight.semibold : theme.font.weight.regular,
                    color: earned ? theme.colors.text : theme.colors.subtext,
                  }}>
                    {t.label}
                  </Text>
                  {unit && (
                    <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext }}>
                      · {t.threshold} {unit}
                    </Text>
                  )}
                </View>
                {earned && earnedTier === t.tier && (
                  <Text style={{ fontSize: theme.font.size.xs, color: topColor, fontWeight: theme.font.weight.semibold }}>
                    Current
                  </Text>
                )}
              </View>
            )
          })}
        </View>
      )}
    </Animated.View>
  )
}
