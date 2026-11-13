import React from 'react'
import { View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Circle, Path, Polygon } from 'react-native-svg'
import { theme } from '../../constants/theme'

export type ElementalBorderType = 'storm' | 'aether'

type Props = {
  type: ElementalBorderType
  size: number
  ring: number
  /** This centre hides frame art so decoration never covers the profile photo. */
  children?: React.ReactNode
  centreColor?: string
  dimmed?: boolean
}

/** The real elemental frame, shared by avatars and picker previews. */
export function ElementalBorderFrame({ type, size, ring, children, centreColor = theme.colors.card, dimmed = false }: Props) {
  const innerSize = size - ring * 2
  const isStorm = type === 'storm'

  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', opacity: dimmed ? 0.3 : 1 }}>
      {isStorm ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: size / 2, backgroundColor: '#18324D' }} />
      ) : (
        <LinearGradient
          colors={['#6F47E9', '#F0D9FF', '#9E6CFF', '#6F47E9'] as [string, string, string, string]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: size / 2 }}
        />
      )}
      <Svg pointerEvents="none" width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
        {isStorm ? <StormArtwork /> : <AetherArtwork />}
      </Svg>
      <View style={{ position: 'absolute', top: ring, left: ring, right: ring, bottom: ring, borderRadius: innerSize / 2, overflow: 'hidden', backgroundColor: centreColor, alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </View>
    </View>
  )
}

function StormArtwork() {
  return <>
    <Circle cx="50" cy="50" r="47" stroke="#7BE7FF" strokeWidth="2.5" fill="none" />
    <Path d="M10 42 C14 27, 27 14, 43 10" stroke="#D4FAFF" strokeWidth="4" fill="none" strokeLinecap="round" />
    <Path d="M57 10 C73 14, 86 27, 90 42" stroke="#65D9FF" strokeWidth="4" fill="none" strokeLinecap="round" />
    <Path d="M90 58 C86 73, 73 86, 57 90" stroke="#AA91FF" strokeWidth="4" fill="none" strokeLinecap="round" />
    <Path d="M43 90 C27 86, 14 73, 10 58" stroke="#65D9FF" strokeWidth="4" fill="none" strokeLinecap="round" />
  </>
}

function AetherArtwork() {
  return <>
    <Circle cx="50" cy="50" r="47" stroke="#F2DEFF" strokeWidth="2" fill="none" opacity="0.9" />
    <Path d="M12 39 C17 22, 31 11, 46 9" stroke="#C393FF" strokeWidth="3" fill="none" strokeLinecap="round" />
    <Path d="M54 9 C69 11, 83 22, 88 39" stroke="#EACBFF" strokeWidth="3" fill="none" strokeLinecap="round" />
    <Path d="M88 61 C83 78, 69 89, 54 91" stroke="#EACBFF" strokeWidth="3" fill="none" strokeLinecap="round" />
    <Path d="M46 91 C31 89, 17 78, 12 61" stroke="#C393FF" strokeWidth="3" fill="none" strokeLinecap="round" />
    <Polygon points="50,1 55,8 50,15 45,8" fill="#F1D7FF" stroke="#FFFFFF" strokeWidth="1" />
    <Polygon points="50,85 55,92 50,99 45,92" fill="#B982FF" stroke="#F1D7FF" strokeWidth="1" />
  </>
}
