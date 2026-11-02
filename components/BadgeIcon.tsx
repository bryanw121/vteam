import React from 'react'
import { View, Image } from 'react-native'
import { Text } from './ui/Text'
import { LinearGradient } from 'expo-linear-gradient'
import Ionicons from '@expo/vector-icons/Ionicons'
import { badgeTierLabel, BADGE_CATEGORY_GRADIENTS, type BadgeDef } from '../constants/badges'
import { theme } from '../constants/theme'
import { useBadgeArt } from '../hooks/useBadgeArt'

type Props = {
  def: BadgeDef
  /** Current earned tier (1–5); 0 or undefined = locked. */
  tier?: number
  size?: 'sm' | 'lg'
  showLabel?: boolean
  /** Slot number (1–3) shown as a pip top-right. */
  slotNumber?: number
}

// ─── Fixed dimensions ─────────────────────────────────────────────────────────
const FRAME: Record<'sm' | 'lg', number> = { sm: 58, lg: 96 }
const ICON:  Record<'sm' | 'lg', number> = { sm: 24, lg: 42 }
const GAP:   Record<'sm' | 'lg', number> = { sm: 9,  lg: 12 }
const LABEL_LINE = 14
const LABEL_H    = LABEL_LINE * 2

// ─── BadgeIcon ────────────────────────────────────────────────────────────────
export function BadgeIcon({ def, tier, size = 'sm', showLabel = false, slotNumber }: Props) {
  const earned   = (tier ?? 0) > 0
  const fs       = FRAME[size]
  const iconSize = ICON[size]
  const gap      = GAP[size]
  const isTiered = def.tiers.length > 1
  const r        = fs / 2

  const [topColor, bottomColor] = BADGE_CATEGORY_GRADIENTS[def.type] ?? ['#888', '#444']
  const label = earned ? badgeTierLabel(def, tier!) : def.tiers[0].label

  // Resolve image URI: generated art for the earned tier (badge_art, #10), then
  // the per-tier image in code, then a single imageUri, else the gradient icon.
  const art = useBadgeArt()
  const generatedUri = earned ? art[def.type]?.[tier!] : undefined
  const resolvedImageUri = generatedUri || (earned && def.tierImageUris?.[tier!]) || def.imageUri
  // Tiered image badges (e.g. spike) render larger since they're detailed artwork
  const imageScale = generatedUri || def.tierImageUris ? 1.4 : 1.2

  return (
    <View style={{ alignItems: 'center', gap }}>

      {/* ── Icon area ── */}
      <View style={{ width: fs, height: fs, alignItems: 'center', justifyContent: 'center' }}>

        {resolvedImageUri ? (
          // Image badge — renders larger as a free-form sticker using image transparency
          <Image
            source={{ uri: resolvedImageUri }}
            style={{ width: fs * imageScale, height: fs * imageScale, opacity: earned ? 1 : 0.25 }}
            resizeMode="contain"
          />
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
        <Text
          numberOfLines={2}
          style={{
            height: LABEL_H,
            fontSize: theme.font.size.xs,
            fontWeight: earned ? theme.font.weight.semibold : theme.font.weight.regular,
            color: earned ? theme.colors.text : theme.colors.subtext,
            textAlign: 'center',
            lineHeight: LABEL_LINE,
            opacity: earned ? 1 : 0.5,
            width: fs - 4,
          }}
        >
          {label}
        </Text>
      )}
    </View>
  )
}
