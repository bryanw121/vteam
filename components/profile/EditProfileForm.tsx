import { profileAvatarSmallUri } from '../../utils'
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Text } from '../ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { BADGE_DEFINITIONS, PROFILE_BORDERS, badgeTierLabel, badgeTitle, isBorderUnlocked, shared, theme } from '../../constants'
import type { ProfileBorderType } from '../../constants'
import { Button } from '../Button'
import { Input } from '../Input'
import { BadgeIcon } from '../BadgeIcon'
import { BadgeSlotSheet } from './BadgeSlotSheet'
import { BorderSwatch } from './BorderSwatch'
import { VOLLEYBALL_POSITION_OPTIONS, VOLLEYBALL_SKILL_LEVEL_OPTIONS } from './options'
import type { Profile, ProfilePatch, UserBadge, VolleyballPosition, VolleyballSkillLevel } from '../../types'
import { MajorCityAutocomplete } from '../MajorCityAutocomplete'
import { useUserSettings } from '../../hooks/useUserSettings'
import { SKILL_LEVEL_HINTS } from '../../constants/copy'

type Props = {
  profile: Profile
  badges: UserBadge[]
  saving: boolean
  /** Saves the text/position/skill drafts. */
  onSave: (patch: ProfilePatch) => void
  /** Saves immediately (the border picker has no draft). */
  onSetBorder: (border: ProfileBorderType | null) => void
  onSetBadgeSlot: (badgeType: string, slot: number | null, displayTier?: number | null) => void
}

const BIO_MAX = 140
const MAX_POSITIONS = 3
const BADGE_SLOTS = [1, 2, 3]

function ClearLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.primaryText, fontWeight: theme.font.weight.medium }}>Clear</Text>
    </Pressable>
  )
}

function PositionOptionChip({ label, rank, onPress }: { label: string; rank?: number; onPress: () => void }) {
  const active = rank !== undefined
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 5,
        borderRadius: theme.radius.full, borderWidth: 1,
        borderColor: active ? theme.colors.primary : theme.colors.border,
        backgroundColor: active ? theme.colors.primary + '14' : theme.colors.card,
        paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm,
        maxWidth: '100%',
      }}
    >
      {active && (
        <View style={{ width: 19, height: 19, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.bold, color: theme.colors.onPrimary, lineHeight: 13 }}>{rank}</Text>
        </View>
      )}
      <Text style={{
        fontSize: theme.font.size.sm, lineHeight: theme.font.lineHeight.tight,
        fontWeight: active ? theme.font.weight.semibold : theme.font.weight.regular,
        color: active ? theme.colors.primary : theme.colors.text,
      }}>
        {label}
      </Text>
    </Pressable>
  )
}

/** The edit-mode body of the Profile tab: name, bio, skill, positions, pinned badges and border. */
export function EditProfileForm({ profile, badges, saving, onSave, onSetBorder, onSetBadgeSlot }: Props) {
  const [firstName, setFirstName] = useState(profile.first_name ?? '')
  const [lastName, setLastName] = useState(profile.last_name ?? '')
  const [bio, setBio] = useState(profile.bio ?? '')
  const [skillLevel, setSkillLevel] = useState<VolleyballSkillLevel | null>(profile.skill_level ?? null)
  const [positions, setPositions] = useState<VolleyballPosition[]>([...profile.position])
  const [pickingSlot, setPickingSlot] = useState<number | null>(null)
  const { settings, setHomeCity } = useUserSettings()

  const earned = badges.map(b => ({ badge_type: b.badge_type, tier: b.tier }))

  function save() {
    onSave({
      position: positions,
      skill_level: skillLevel,
      bio: bio.trim() || null,
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
    })
  }

  return (
    <>
      <View style={[shared.card, { marginTop: theme.spacing.md }]}>
        <Text style={shared.subheading}>Name</Text>
        <View style={shared.mt_sm} />
        <Input label="First Name" value={firstName} onChangeText={setFirstName} placeholder="Jane" autoCorrect={false} autoCapitalize="words" />
        <Input label="Last Name" value={lastName} onChangeText={setLastName} placeholder="Smith" autoCorrect={false} autoCapitalize="words" />
      </View>

      {/* Saved on pick (a private setting, not part of the profile Save). */}
      <View style={[shared.card, { marginTop: theme.spacing.md }]}>
        <Text style={shared.subheading}>Home city</Text>
        <Text style={[shared.caption, shared.mt_sm]}>
          The Events feed shows sessions from other venues near you. We're piloting in Austin.
        </Text>
        <MajorCityAutocomplete label="City" value={settings?.home_city ?? null} onChange={city => void setHomeCity(city)} />
      </View>

      <View style={[shared.card, { marginTop: theme.spacing.md }]}>
        <Text style={shared.subheading}>Bio</Text>
        <View style={shared.mt_sm} />
        <Input
          value={bio}
          onChangeText={t => setBio(t.slice(0, BIO_MAX))}
          placeholder="Tell the club a little about yourself…"
          multiline
          numberOfLines={3}
          maxLength={BIO_MAX}
          autoCorrect={false}
          containerStyle={{ marginBottom: 0 }}
          inputStyle={{ padding: theme.spacing.md, paddingTop: theme.spacing.md }}
        />
        <Text style={[shared.caption, { textAlign: 'right', marginTop: theme.spacing.xs, color: bio.length >= 130 ? theme.colors.error : theme.colors.subtext }]}>
          {bio.length}/{BIO_MAX}
        </Text>
      </View>

      <View style={[shared.card, { marginTop: theme.spacing.md }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={shared.subheading}>Skill level</Text>
          {skillLevel !== null && <ClearLink onPress={() => setSkillLevel(null)} />}
        </View>
        <Text style={[shared.caption, shared.mt_xs]}>Shown to hosts when you join events so they can balance teams.</Text>
        <View role="radiogroup" aria-label="Skill level" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
          {VOLLEYBALL_SKILL_LEVEL_OPTIONS.map(opt => {
            const active = skillLevel === opt.value
            return (
              <Pressable
                key={opt.value}
                onPress={() => setSkillLevel(active ? null : opt.value)}
                role="radio"
                aria-checked={active}
                aria-label={opt.label}
                style={{
                  borderRadius: theme.radius.full,
                  borderWidth: 1,
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                  backgroundColor: active ? theme.colors.primary + '14' : theme.colors.card,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                }}
              >
                <Text style={{
                  fontSize: theme.font.size.sm,
                  fontWeight: active ? theme.font.weight.semibold : theme.font.weight.regular,
                  color: active ? theme.colors.primary : theme.colors.text,
                }}>
                  {opt.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
        {skillLevel && SKILL_LEVEL_HINTS[skillLevel] ? (
          <Text style={[shared.caption, shared.mt_xs]} testID="skill-level-hint">{SKILL_LEVEL_HINTS[skillLevel]}</Text>
        ) : null}
      </View>

      <View style={[shared.card, { marginTop: theme.spacing.md }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={shared.subheading}>Preferred Positions</Text>
          {positions.length > 0 && <ClearLink onPress={() => setPositions([])} />}
        </View>
        <Text style={[shared.caption, shared.mt_xs]}>Rank up to {MAX_POSITIONS} positions. Tap to add in order, tap again to remove.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
          {VOLLEYBALL_POSITION_OPTIONS.map(opt => {
            const rankIdx = positions.indexOf(opt.value)
            return (
              <PositionOptionChip
                key={opt.value}
                label={opt.label}
                rank={rankIdx !== -1 ? rankIdx + 1 : undefined}
                onPress={() => setPositions(prev =>
                  prev.includes(opt.value)
                    ? prev.filter(p => p !== opt.value)
                    : prev.length >= MAX_POSITIONS ? prev : [...prev, opt.value],
                )}
              />
            )
          })}
        </View>
      </View>

      <View style={[shared.card, { marginTop: theme.spacing.md }]}>
        <Text style={shared.subheading}>Display Badges</Text>
        <Text style={[shared.caption, shared.mt_xs]}>Up to 3 badges shown on your profile. Tap a slot to pick.</Text>
        <View style={{ flexDirection: 'row', gap: theme.spacing.lg, marginTop: theme.spacing.md, justifyContent: 'center' }}>
          {BADGE_SLOTS.map(slot => {
            const badge = badges.find(b => b.display_order === slot)
            const def = badge ? BADGE_DEFINITIONS.find(d => d.type === badge.badge_type) : null
            return (
              <View key={slot} style={{ alignItems: 'center', gap: 4 }}>
                <View style={{ position: 'relative' }}>
                  {def && badge ? (
                    <>
                      <BadgeIcon def={def} tier={badge.display_tier ?? badge.tier} size="sm" />
                      <Pressable
                        onPress={() => onSetBadgeSlot(badge.badge_type, null)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove badge from slot ${slot}`}
                        style={{
                          position: 'absolute', top: -4, right: -4,
                          width: 18, height: 18, borderRadius: 9,
                          backgroundColor: theme.colors.subtext,
                          alignItems: 'center', justifyContent: 'center',
                          borderWidth: 1.5, borderColor: theme.colors.card,
                        }}
                      >
                        <Ionicons name="close" size={10} color={theme.colors.white} />
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      onPress={() => setPickingSlot(slot)}
                      accessibilityRole="button"
                      accessibilityLabel={`Pick a badge for slot ${slot}`}
                      style={({ pressed }) => ({
                        width: 58, height: 58, borderRadius: 29,
                        borderWidth: 2, borderColor: pressed ? theme.colors.primary : theme.colors.border,
                        borderStyle: 'dashed',
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: pressed ? theme.colors.primary + '0A' : 'transparent',
                      })}
                    >
                      <Ionicons name="add" size={22} color={theme.colors.subtext} />
                    </Pressable>
                  )}
                </View>
                <Text style={[shared.caption, { color: theme.colors.subtext }]} numberOfLines={1}>
                  {def && badge
                    ? (def.tiers.length > 1 ? badgeTierLabel(def, badge.display_tier ?? badge.tier) : badgeTitle(def.type))
                    : `Slot ${slot}`}
                </Text>
              </View>
            )
          })}
        </View>
      </View>

      <View style={[shared.card, { marginTop: theme.spacing.md }]}>
        <Text style={shared.subheading}>Profile Border</Text>
        <Text style={[shared.caption, shared.mt_xs]}>Select a border for your avatar.</Text>
        <View role="radiogroup" aria-label="Profile border" style={{ flexDirection: 'row', gap: theme.spacing.lg, marginTop: theme.spacing.md, flexWrap: 'wrap' }}>
          <BorderSwatch avatarUri={profileAvatarSmallUri(profile.avatar_url)} label="None" selected={!profile.selected_border} unlocked onPress={() => onSetBorder(null)} />
          {PROFILE_BORDERS.map(border => {
            const unlocked = isBorderUnlocked(border, earned)
            return (
              <BorderSwatch avatarUri={profileAvatarSmallUri(profile.avatar_url)}
                key={border.type}
                label={border.label}
                borderDef={border}
                selected={profile.selected_border === border.type}
                unlocked={unlocked}
                onPress={() => onSetBorder(border.type)}
              />
            )
          })}
        </View>
      </View>

      <View style={{ marginTop: theme.spacing.md }}>
        <Button label="Save profile" onPress={save} loading={saving} disabled={saving} />
      </View>

      <BadgeSlotSheet
        slot={pickingSlot}
        badges={badges}
        onPick={(badgeType, slot, tier) => onSetBadgeSlot(badgeType, slot, tier)}
        onDismiss={() => setPickingSlot(null)}
      />
    </>
  )
}
