import React, { useEffect } from 'react'
import { View, Platform } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { theme } from '../../constants/theme'
import type { LegendBorderProps } from '../../types'

/**
 * The Legend avatar border: a rainbow ring that spins (the photo counter-
 * rotates so it stays upright) with a pulsing glow. Native animates it with
 * Reanimated; the web variant (LegendRing.web.tsx) uses CSS keyframes so the
 * web entry chunk doesn't carry Reanimated (#193).
 */
export function LegendBorder({ children, outerSize, ring }: LegendBorderProps) {
  const avatarSize = outerSize - ring * 2
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
          top: ring, left: ring, right: ring, bottom: ring,
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
