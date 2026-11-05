import React, { useEffect } from 'react'
import { View, Platform, Pressable } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Circle, Path, Polygon } from 'react-native-svg'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme } from '../constants/theme'
import type { Profile } from '../types'
import { Spinner } from './ui/Spinner'

const RING = 3

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

function LegendBorder({ children, outerSize }: { children: React.ReactNode; outerSize: number }) {
  const avatarSize = outerSize - RING * 2
  const rot = useSharedValue(0)
  const glowO = useSharedValue(0.45)

  useEffect(() => {
    rot.value = withRepeat(withTiming(360, { duration: 3200, easing: Easing.linear }), -1, false)
    glowO.value = withRepeat(withTiming(0.9, { duration: 2000, easing: Easing.inOut(Easing.sin) }), -1, true)
  }, [])

  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }))
  const counterStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `-${rot.value}deg` }] }))
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowO.value }))

  return (
    <View style={{ width: outerSize, height: outerSize }}>
      <Animated.View
        pointerEvents="none"
        style={[{
          position: 'absolute',
          top: -10, left: -10,
          width: outerSize + 20, height: outerSize + 20,
          borderRadius: (outerSize + 20) / 2,
          backgroundColor: '#A78BFA18',
          ...Platform.select({
            ios: { shadowColor: '#A78BFA', shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1 },
            android: { elevation: 14 },
            web: { filter: 'blur(8px)' } as any,
          }),
        }, glowStyle]}
      />
      <Animated.View style={[{
        width: outerSize, height: outerSize,
        borderRadius: outerSize / 2,
        overflow: 'hidden',
      }, spinStyle]}>
        <LinearGradient
          colors={['#A78BFA', '#38BDF8', '#34D399', '#FBBF24', '#F43F5E', '#A78BFA'] as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <Animated.View style={[{
          position: 'absolute',
          top: RING, left: RING, right: RING, bottom: RING,
          borderRadius: avatarSize / 2,
          overflow: 'hidden',
          backgroundColor: theme.colors.card,
          alignItems: 'center', justifyContent: 'center',
        }, counterStyle]}>
          {children}
        </Animated.View>
      </Animated.View>
    </View>
  )
}

/** Wind and storm currents — earned for top-tier communication cheers. */
function StormBorder({ children, outerSize }: { children: React.ReactNode; outerSize: number }) {
  const avatarSize = outerSize - RING * 2
  return (
    <View style={{ width: outerSize, height: outerSize }}>
      <Svg width={outerSize} height={outerSize} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
        <Circle cx="50" cy="50" r="46" stroke="#7BE7FF" strokeWidth="3" fill="#75DFFF16" />
        <Path d="M12 38 C21 17, 42 12, 57 22 C68 30, 63 39, 51 38" stroke="#D4FAFF" strokeWidth="5" fill="none" strokeLinecap="round" />
        <Path d="M87 61 C78 83, 57 88, 42 78 C31 70, 36 61, 48 62" stroke="#65D9FF" strokeWidth="5" fill="none" strokeLinecap="round" />
        <Path d="M28 78 C16 70, 14 56, 24 47" stroke="#AA91FF" strokeWidth="3" fill="none" strokeLinecap="round" />
        <Path d="M72 22 C84 30, 86 44, 76 53" stroke="#AA91FF" strokeWidth="3" fill="none" strokeLinecap="round" />
      </Svg>
      <RingHole size={avatarSize} ring={RING}>{children}</RingHole>
    </View>
  )
}

/** A precise, crystal-guided energy ring — earned for top-tier setting cheers. */
function AetherBorder({ children, outerSize }: { children: React.ReactNode; outerSize: number }) {
  const avatarSize = outerSize - RING * 2
  return (
    <View style={{ width: outerSize, height: outerSize, borderRadius: outerSize / 2, overflow: 'visible' }}>
      <LinearGradient
        colors={['#6F47E9', '#F0D9FF', '#9E6CFF', '#6F47E9'] as [string, string, string, string]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: outerSize / 2 }}
      />
      <Svg width={outerSize} height={outerSize} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
        <Circle cx="50" cy="50" r="40" stroke="#F2DEFF" strokeWidth="1.5" fill="none" opacity="0.8" />
        <Path d="M17 61 C31 82, 69 82, 83 61" stroke="#EACBFF" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <Path d="M22 32 C39 14, 61 14, 78 32" stroke="#C393FF" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <Polygon points="50,0 57,9 50,18 43,9" fill="#F1D7FF" stroke="#FFFFFF" strokeWidth="1" />
        <Polygon points="50,82 56,91 50,100 44,91" fill="#B982FF" stroke="#F1D7FF" strokeWidth="1" />
      </Svg>
      <RingHole size={avatarSize} ring={RING}>{children}</RingHole>
    </View>
  )
}

/**
 * Avatar circle with an optional animated border. Read-only by default (use it
 * when viewing any profile); the owner's own profile passes `onPress` /
 * `onDelete` to make the picture changeable and removable.
 */
export function ProfileAvatar({ uri, border, size, loading = false, onPress, onDelete }: Props) {
  const outerSize = size + RING * 2

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
  if (border === 'gradient') bordered = <LegendBorder outerSize={outerSize}>{inner}</LegendBorder>
  else if (border === 'storm') bordered = <StormBorder outerSize={outerSize}>{inner}</StormBorder>
  else if (border === 'aether') bordered = <AetherBorder outerSize={outerSize}>{inner}</AetherBorder>
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
