import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { BADGE_DEFINITIONS, theme } from '../../constants'
import { profileFullName, volleyballSkillLevelLabel } from '../../utils'
import { BadgeIcon } from '../BadgeIcon'
import { shortPositionLabel } from './options'
import type { Profile, UserBadge } from '../../types'

type Props = {
  profile: Profile
  /** The picture (the owner's uploader, or a plain ProfileAvatar), drawn at PROFILE_HERO_AVATAR. */
  avatar: ReactNode
  /** Under the name: Edit profile on your own, the friend button on someone else's. */
  actions?: ReactNode
  /** At the right of the name row (Share). */
  trailing?: ReactNode
  totalCheers: number
  /** Accumulated points (`point_balances`). */
  totalPoints: number
  /** Tournament trophies won (any place). */
  trophyCount?: number
  /** Badges pinned to the display slots, in slot order. */
  displayedBadges: UserBadge[]
  /** `profile` on your own (Profile tab), `user-profile` on someone else's. */
  testIdPrefix?: 'profile' | 'user-profile'
}

export const PROFILE_HERO_AVATAR = 72

/** "@bryan · OH · BB": who this is on court, in one line. */
function subline(profile: Profile): string {
  return [
    profile.username ? `@${profile.username}` : null,
    ...(profile.position ?? []).slice(0, 2).map(shortPositionLabel),
    profile.skill_level ? volleyballSkillLevelLabel(profile.skill_level) : null,
  ].filter(Boolean).join(' · ')
}

/**
 * The top of a profile (Party invite layout): avatar and name on the page, pinned
 * badges, bio, then three colour-coded counts. Shared by the Profile tab and other
 * players' profiles.
 */
export function ProfileHero({ profile, avatar, actions, trailing, totalCheers, totalPoints, trophyCount = 0, displayedBadges, testIdPrefix = 'profile' }: Props) {
  const line = subline(profile)
  return (
    <View style={styles.wrap} testID={`${testIdPrefix}-hero`}>
      <View style={styles.head}>
        {avatar}
        <View style={styles.headText}>
          <Text style={styles.name} numberOfLines={2}>{profileFullName(profile)}</Text>
          {line ? <Text style={styles.subline} numberOfLines={1}>{line}</Text> : null}
          {actions ? <View style={styles.headActions}>{actions}</View> : null}
        </View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>

      {displayedBadges.length > 0 && (
        <View style={styles.badges}>
          {displayedBadges.map(badge => {
            const def = BADGE_DEFINITIONS.find(d => d.type === badge.badge_type)
            if (!def) return null
            return <BadgeIcon key={badge.badge_type} def={def} tier={badge.display_tier ?? badge.tier} size="sm" />
          })}
        </View>
      )}

      {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

      <View style={styles.stats}>
        <Stat value={totalPoints} label="points" color={theme.colors.primaryText} testID={`${testIdPrefix}-points-count`} />
        <Stat value={totalCheers} label="cheers" color={theme.colors.hot} testID={`${testIdPrefix}-cheers-count`} />
        <Stat value={trophyCount} label={trophyCount === 1 ? 'trophy' : 'trophies'} color={theme.colors.text} testID={`${testIdPrefix}-trophies-count`} />
      </View>
    </View>
  )
}

/** The small "Edit profile" pill under your own name. */
export function EditProfilePill({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Edit profile"
      hitSlop={6}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.editPill, (pressed || hovered) && styles.editPillActive]}
    >
      <Ionicons name="create-outline" size={15} color={theme.colors.primaryText} />
      <Text style={styles.editText}>Edit profile</Text>
    </Pressable>
  )
}

function Stat({ value, label, color, testID }: { value: number; label: string; color: string; testID: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <Text testID={testID} style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headText: { flex: 1, gap: 2, minWidth: 0 },
  trailing: { alignSelf: 'flex-start' },
  name: {
    fontFamily: theme.fonts.display,
    fontSize: theme.font.heading.md,
    letterSpacing: -0.5,
    color: theme.colors.text,
  },
  subline: { fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.subtext },
  headActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  badges: { flexDirection: 'row', gap: theme.spacing.md, justifyContent: 'center' },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primarySoft,
  },
  editPillActive: { backgroundColor: theme.colors.primary + '33' },
  editText: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm, color: theme.colors.primaryText },
  bio: { fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.subtext, lineHeight: 20 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statValue: { fontFamily: theme.fonts.display, fontSize: theme.font.heading.md, letterSpacing: -0.5 },
  statLabel: { fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext },
})
