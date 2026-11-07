import React from 'react'
import { View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { theme } from '../../constants/theme'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import type { LegendBorderProps } from '../../types'

/*
 * Web: the same spin and glow as LegendRing.tsx, drawn with CSS keyframes
 * (react-native-web's animationKeyframes) instead of Reanimated, which keeps
 * Reanimated out of the web entry chunk (#193). Reduced motion: still ring.
 */
const SPIN = { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } }
const COUNTER = { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(-360deg)' } }
const GLOW = { from: { opacity: 0.45 }, to: { opacity: 0.9 } }

// react-native-web style props that RN's types don't know about.
const loop = (keyframes: object, ms: number, easing: string, alternate = false) => ({
  animationKeyframes: [keyframes],
  animationDuration: `${ms}ms`,
  animationTimingFunction: easing,
  animationIterationCount: 'infinite',
  ...(alternate ? { animationDirection: 'alternate' } : {}),
}) as object

export function LegendBorder({ children, outerSize, ring }: LegendBorderProps) {
  const reduced = useReducedMotion()
  const avatarSize = outerSize - ring * 2
  const spin = reduced ? null : loop(SPIN, 3200, 'linear')
  const counter = reduced ? null : loop(COUNTER, 3200, 'linear')
  const glow = reduced ? { opacity: 0.7 } : loop(GLOW, 2000, 'ease-in-out', true)

  return (
    <View style={{ width: outerSize, height: outerSize }}>
      <View
        pointerEvents="none"
        style={[{
          position: 'absolute',
          top: -10, left: -10,
          width: outerSize + 20, height: outerSize + 20,
          borderRadius: (outerSize + 20) / 2,
          backgroundColor: '#A78BFA18',
          filter: 'blur(8px)',
        } as object, glow]}
      />
      <View style={[{
        width: outerSize, height: outerSize,
        borderRadius: outerSize / 2,
        overflow: 'hidden',
      }, spin]}>
        <LinearGradient
          colors={['#A78BFA', '#38BDF8', '#34D399', '#FBBF24', '#F43F5E', '#A78BFA'] as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View style={[{
          position: 'absolute',
          top: ring, left: ring, right: ring, bottom: ring,
          borderRadius: avatarSize / 2,
          overflow: 'hidden',
          backgroundColor: theme.colors.card,
          alignItems: 'center', justifyContent: 'center',
        }, counter]}>
          {children}
        </View>
      </View>
    </View>
  )
}
