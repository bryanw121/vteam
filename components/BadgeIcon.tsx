import React from 'react'
import { View, Image } from 'react-native'
import { Text } from './ui/Text'
import { LinearGradient } from 'expo-linear-gradient'
import Ionicons from '@expo/vector-icons/Ionicons'
import { badgeTierLabel, badgeTitle, BADGE_VISIBILITY_ENABLED, BADGE_CATEGORY_GRADIENTS, type BadgeDef } from '../constants/badges'
import { BADGE_ARTWORK } from '../constants/badgeArtwork'
import { theme } from '../constants/theme'

type Props = {
  def: BadgeDef
  /** Current earned tier (1–5); 0 or undefined = locked. */
  tier?: number
  size?: 'sm' | 'collection' | 'lg'
  showLabel?: boolean
  /** Slot number (1–3) shown as a pip top-right. */
  slotNumber?: number
}

// ─── Fixed dimensions ─────────────────────────────────────────────────────────
const FRAME = { sm: 58, collection: BADGE_VISIBILITY_ENABLED ? 72 : 58, lg: 96 }
const ICON = { sm: 24, collection: 32, lg: 42 }
const GAP = { sm: 9, collection: BADGE_VISIBILITY_ENABLED ? 10 : 9, lg: 12 }
const OUTLINE_OFFSETS = [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]] as const
const TIER_NAMES = ['Bronze', 'Silver', 'Gold', 'Elite', 'Legend']
const LABEL_LINE = 14
const LABEL_H    = LABEL_LINE * 2

// ─── BadgeIcon ────────────────────────────────────────────────────────────────
export function BadgeIcon({ def, tier, size = 'sm', showLabel = false, slotNumber }: Props) {
  const earned   = (tier ?? 0) > 0
  const fs       = FRAME[size]
  const iconSize = ICON[size]
  const gap      = GAP[size]
  const r        = fs / 2

  const [topColor, bottomColor] = BADGE_CATEGORY_GRADIENTS[def.type] ?? ['#888', '#444']
  const label = earned ? badgeTierLabel(def, tier!) : def.tiers[0].label
  const collection = BADGE_VISIBILITY_ENABLED && size === 'collection'
  const state = !earned ? 'Locked' : def.tiers.length === 1 ? 'Special' : TIER_NAMES[tier! - 1]

  // Resolve image URI: per-tier image takes precedence over a single imageUri
  const resolvedImageUri = (earned && def.tierImageUris?.[tier!]) || def.imageUri
  const bundledArtwork = BADGE_ARTWORK[def.type]?.[earned ? tier! : def.tiers[0].tier]
  const resolvedImageSource = bundledArtwork ?? (resolvedImageUri ? { uri: resolvedImageUri } : undefined)
  // The bundled PNGs share a padded canvas; keep the art inside the label gap.
  const imageScale = bundledArtwork ? 1.15 : def.tierImageUris ? 1.4 : 1.2
  const imageSize = fs * imageScale
  const imageInset = (fs - imageSize) / 2
  const outlined = BADGE_VISIBILITY_ENABLED && bundledArtwork != null
  const imageOpacity = earned ? 1 : BADGE_VISIBILITY_ENABLED ? (size === 'lg' ? 1 : 0.6) : 0.25

  return (
    <View style={{ alignItems: 'center', gap, ...(collection ? { width: '100%' } : {}) }}>

      {/* ── Icon area ── */}
      <View style={{ width: fs, height: fs, alignItems: 'center', justifyContent: 'center' }}>

        {resolvedImageSource ? (
          <View testID={`badge-image-group-${def.type}`} style={{ width: fs, height: fs, opacity: imageOpacity }}>
            {/* Tint only the alpha silhouette, then overlay the untouched artwork.
                This gives web and native the same thin edge without new assets. */}
            {outlined && OUTLINE_OFFSETS.map(([x, y], i) => (
              <Image
                key={i}
                source={resolvedImageSource}
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                tintColor={theme.colors.text}
                resizeMode="contain"
                style={{ position: 'absolute', left: imageInset + x, top: imageInset + y, width: imageSize, height: imageSize }}
              />
            ))}
            <Image
              source={resolvedImageSource}
              testID={`badge-artwork-${def.type}`}
              accessibilityLabel={earned ? label : `${label} (locked)`}
              style={{ position: 'absolute', left: imageInset, top: imageInset, width: imageSize, height: imageSize }}
              resizeMode="contain"
            />
          </View>
        ) : (
          // Standard badge — gradient circle
          <View style={{ width: fs, height: fs, borderRadius: r, overflow: 'hidden', opacity: earned ? 1 : 0.35 }}>
            {earned ? (
              <LinearGradient
                colors={[topColor, bottomColor] as [string, string]}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
              >
                <View style={{
                  position: 'absolute', top: 0, left: 0, right: 0,
                  height: fs * 0.45,
                  backgroundColor: 'rgba(255,255,255,0.18)',
                  borderTopLeftRadius: r, borderTopRightRadius: r,
                }} />
                <Ionicons name={def.icon as any} size={iconSize} color={theme.colors.white} />
              </LinearGradient>
            ) : (
              <View style={{ flex: 1, backgroundColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="lock-closed-outline" size={iconSize - 2} color={theme.colors.subtext} />
              </View>
            )}
          </View>
        )}

        {BADGE_VISIBILITY_ENABLED && !earned && resolvedImageSource && (
          <View testID={`badge-lock-${def.type}`} style={{ position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.subtextStrong, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="lock-closed" size={12} color={theme.colors.text} />
          </View>
        )}

        {/* Slot number pip */}
        {slotNumber != null && earned && (
          <View style={{
            position: 'absolute', top: -2, right: -2,
            width: 19, height: 19, borderRadius: 10,
            backgroundColor: theme.colors.primary,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: theme.colors.card,
          }}>
            <Text style={{ fontSize: theme.font.size.xs, fontWeight: '800', color: theme.colors.white, lineHeight: 13 }}>
              {slotNumber}
            </Text>
          </View>
        )}
      </View>


      {/* ── Label ── */}
      {showLabel && (
        <View style={{ alignItems: 'center', gap: 3, ...(collection ? { width: '100%' } : {}) }}>
          <Text
            numberOfLines={collection ? undefined : 2}
            style={{
              ...(collection ? { minHeight: 16, width: '100%' } : { height: LABEL_H, width: fs - 4 }),
              fontSize: collection ? theme.font.size.sm : theme.font.size.xs,
              fontWeight: earned ? theme.font.weight.semibold : theme.font.weight.regular,
              color: earned ? theme.colors.text : BADGE_VISIBILITY_ENABLED ? theme.colors.subtextStrong : theme.colors.subtext,
              textAlign: 'center',
              lineHeight: collection ? 16 : LABEL_LINE,
              opacity: earned || BADGE_VISIBILITY_ENABLED ? 1 : 0.5,
            }}
          >
            {label}
          </Text>
          {collection && <Text style={{ fontSize: theme.font.size.xs, lineHeight: 15, color: theme.colors.subtextStrong, textAlign: 'center' }}>{state} · {badgeTitle(def.type)}</Text>}
        </View>
      )}
    </View>
  )
}
