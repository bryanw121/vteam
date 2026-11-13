import React from 'react'
import { View, Platform, Pressable } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { LegendBorder } from './profile/LegendRing'
import { ElementalBorderFrame } from './profile/ElementalBorderFrame'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme } from '../constants/theme'
import type { Profile } from '../types'
import { Spinner } from './ui/Spinner'

const RING = 3
/** Elemental frames have a deliberate, photo-safe outer band. */
const elementalRing = (size: number) => Math.max(2, Math.min(6, Math.round(size * 0.05)))

type Props = {
  uri: string | null
  border: Profile['selected_border']
  size: number
  /** Show a spinner in place of the picture (an upload or lookup in flight). */
  loading?: boolean
  /** Make the picture tappable (the owner's "change photo" action). */
  onPress?: () => void
  /** Show a remove (x) button on the ring's top-right corner. */
  onDelete?: () => void
}

function RingHole({ children, size, ring }: { children: React.ReactNode; size: number; ring: number }) {
  return (
    <View style={{
      position: 'absolute',
      top: ring, left: ring, right: ring, bottom: ring,
      borderRadius: size / 2,
      overflow: 'hidden',
      backgroundColor: theme.colors.card,
      alignItems: 'center', justifyContent: 'center',
    }}>
      {children}
    </View>
  )
}

function BronzeBorder({ children, outerSize }: { children: React.ReactNode; outerSize: number }) {
  return (
    <View style={{ width: outerSize, height: outerSize, borderRadius: outerSize / 2, overflow: 'hidden' }}>
      <LinearGradient
        colors={['#C4873A', '#CD7F32', '#7A3B0A'] as [string, string, string]}
        start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <RingHole size={outerSize - RING * 2} ring={RING}>{children}</RingHole>
    </View>
  )
}

function GoldBorder({ children, outerSize }: { children: React.ReactNode; outerSize: number }) {
  return (
    <View style={[
      { width: outerSize, height: outerSize, borderRadius: outerSize / 2 },
      Platform.select({
        ios: { shadowColor: '#FFD700', shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.72 },
        android: { elevation: 8 },
        web: { filter: 'drop-shadow(0 0 8px #FFD700BB)' } as any,
      }),
    ]}>
      <View style={{ width: outerSize, height: outerSize, borderRadius: outerSize / 2, overflow: 'hidden' }}>
        <LinearGradient
          colors={['#FFE566', '#FFD700', '#C8860A'] as [string, string, string]}
          start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <RingHole size={outerSize - RING * 2} ring={RING}>{children}</RingHole>
      </View>
    </View>
  )
}

/** Wind and storm currents — earned for top-tier communication cheers. */
function StormBorder({ children, outerSize, ring }: { children: React.ReactNode; outerSize: number; ring: number }) {
  return <ElementalBorderFrame type="storm" size={outerSize} ring={ring}>{children}</ElementalBorderFrame>
}

/** A precise, crystal-guided energy ring — earned for top-tier setting cheers. */
function AetherBorder({ children, outerSize, ring }: { children: React.ReactNode; outerSize: number; ring: number }) {
  return <ElementalBorderFrame type="aether" size={outerSize} ring={ring}>{children}</ElementalBorderFrame>
}

/**
 * Avatar circle with an optional animated border. Read-only by default (use it
 * when viewing any profile); the owner's own profile passes `onPress` /
 * `onDelete` to make the picture changeable and removable.
 */
export function ProfileAvatar({ uri, border, size, loading = false, onPress, onDelete }: Props) {
  const ring = border === 'storm' || border === 'aether' ? elementalRing(size) : RING
  const outerSize = size + ring * 2

  const picture = (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
      {loading ? (
        <Spinner color={theme.colors.primary} />
      ) : uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
      ) : (
        <Ionicons name="person" size={Math.round(size * 0.45)} color={theme.colors.subtext} />
      )}
    </View>
  )
  const inner = onPress ? (
    <Pressable onPress={onPress} disabled={loading} accessibilityRole="button" accessibilityLabel="Change profile picture">
      {picture}
    </Pressable>
  ) : picture

  let bordered: React.ReactNode
  if (border === 'gradient') bordered = <LegendBorder outerSize={outerSize} ring={ring}>{inner}</LegendBorder>
  else if (border === 'storm') bordered = <StormBorder outerSize={outerSize} ring={ring}>{inner}</StormBorder>
  else if (border === 'aether') bordered = <AetherBorder outerSize={outerSize} ring={ring}>{inner}</AetherBorder>
  else if (border === 'gold') bordered = <GoldBorder outerSize={outerSize}>{inner}</GoldBorder>
  else if (border === 'bronze') bordered = <BronzeBorder outerSize={outerSize}>{inner}</BronzeBorder>
  else bordered = <View style={{ width: outerSize, height: outerSize, alignItems: 'center', justifyContent: 'center' }}>{inner}</View>

  if (!onDelete) return <>{bordered}</>
  return (
    <View style={{ width: outerSize, height: outerSize, flexShrink: 0 }}>
      {bordered}
      {/* Rendered here, outside every ring's clipping context. */}
      {!loading && (
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel="Remove profile picture"
          style={{
            position: 'absolute', top: 0, right: 0,
            width: 22, height: 22, borderRadius: 11,
            backgroundColor: theme.colors.subtext,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: theme.colors.card,
          }}
        >
          <Ionicons name="close" size={12} color={theme.colors.white} />
        </Pressable>
      )}
    </View>
  )
}
