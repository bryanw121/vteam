import { StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { LinearGradient } from 'expo-linear-gradient'
import { BADGE_DEFINITIONS, theme } from '../../constants'
import { profileFullName, volleyballSkillLevelLabel } from '../../utils'
import { BadgeIcon } from '../BadgeIcon'
import { AvatarUploader } from './AvatarUploader'
import { shortPositionLabel } from './options'
import type { AvatarUploader as AvatarUploaderState } from '../../types'
import type { Profile, UserBadge } from '../../types'

type Props = {
  profile: Profile
  uploader: AvatarUploaderState
  mode: 'menu' | 'edit'
  totalCheers: number
  /** Accumulated points (`point_balances`). */
  totalPoints: number
  /** Badges pinned to the display slots, in slot order. */
  displayedBadges: UserBadge[]
  onEdit: () => void
}

const STAT_LABEL = { fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 1 } as const

/** The profile card at the top of the Profile tab: avatar, name, stats and pinned badges. */
export function ProfileHero({ profile, uploader, mode, totalCheers, totalPoints, displayedBadges, onEdit }: Props) {
  const editing = mode === 'edit'

  return (
    <View style={styles.card}>
      {/* Radial gradient decoration */}
      <LinearGradient
        colors={[theme.colors.primary, 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.3, y: 0.7 }}
        style={{ position: 'absolute', top: 0, right: 0, width: 200, height: 200, borderRadius: 100, opacity: 0.55 }}
        pointerEvents="none"
      />

      {editing ? (
        <View style={{ alignItems: 'center', gap: theme.spacing.xs, width: '100%' }}>
          <AvatarUploader profile={profile} uploader={uploader} editMode />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, width: '100%' }}>
          <AvatarUploader profile={profile} uploader={uploader} editMode={false} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 1, textTransform: 'uppercase' }}>
              Member since {new Date(profile.created_at).getFullYear().toString().slice(2)}
            </Text>
            <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.heading.md, letterSpacing: -0.5, color: theme.colors.white, lineHeight: 24 }}>
              {profileFullName(profile)}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
              {profile.position.slice(0, 2).map(pos => (
                <View key={pos} style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: theme.radius.full, backgroundColor: theme.colors.accent }}>
                  <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.xs, color: theme.colors.accentInk }}>{shortPositionLabel(pos)}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {profile.bio ? (
        <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: 'rgba(255,255,255,0.75)', lineHeight: 18, marginTop: 4, width: '100%' }}>
          {profile.bio}
        </Text>
      ) : null}

      {!editing && (
        <View style={{ flexDirection: 'row', gap: 1, marginTop: 14, borderRadius: 14, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)', width: '100%' }}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: theme.colors.accent }]}>
              {profile.skill_level ? volleyballSkillLevelLabel(profile.skill_level) : '—'}
            </Text>
            <Text style={STAT_LABEL}>Skill</Text>
          </View>
          <View style={styles.stat}>
            <Text testID="profile-cheers-count" style={styles.statValue}>{totalCheers}</Text>
            <Text style={STAT_LABEL}>Cheers</Text>
          </View>
          <View style={styles.stat}>
            <Text testID="profile-points-count" style={styles.statValue}>{totalPoints}</Text>
            <Text style={STAT_LABEL}>Points</Text>
          </View>
          <View style={styles.stat}>
            <Text testID="profile-trophies-count" style={styles.statValue}>{0}</Text>
            <Text style={STAT_LABEL}>Trophies</Text>
          </View>
        </View>
      )}

      {displayedBadges.length > 0 && (
        <View style={styles.badgeRow}>
          {displayedBadges.map(badge => {
            const def = BADGE_DEFINITIONS.find(d => d.type === badge.badge_type)
            if (!def) return null
            return <BadgeIcon key={badge.badge_type} def={def} tier={badge.display_tier ?? badge.tier} size="sm" />
          })}
        </View>
      )}

      {!editing && (
        <View style={{ alignSelf: 'stretch', marginTop: theme.spacing.sm }}>
          <TouchableOpacity
            onPress={onEdit}
            accessibilityRole="button"
            style={{ paddingVertical: 11, borderRadius: theme.radius.md, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center' }}
          >
            <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.white }}>Edit profile</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    padding: 18,
    alignItems: 'center',
    gap: theme.spacing.xs,
    overflow: 'hidden',
    position: 'relative',
  },
  stat: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
  },
  statValue: {
    fontFamily: theme.fonts.display,
    fontSize: theme.font.heading.lg,
    letterSpacing: -1,
    color: theme.colors.white,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
})
