import React from 'react'
import { StyleSheet } from 'react-native'
import { render } from '@testing-library/react-native'
import { Image } from 'expo-image'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { BorderSwatch } from '../components/profile/BorderSwatch'
import { ElementalBorderFrame } from '../components/profile/ElementalBorderFrame'
import { PROFILE_BORDERS } from '../constants/badges'

jest.mock('../components/profile/LegendRing', () => ({ LegendBorder: ({ children }: any) => children }))

it.each(['storm', 'aether'] as const)('%s preserves the full photo at small and profile sizes', border => {
  for (const size of [28, 40, 64, 120]) {
    const view = render(<ProfileAvatar uri="https://example.com/photo.png" border={border} size={size} />)
    const frame = view.UNSAFE_getByType(ElementalBorderFrame)
    expect(frame.props.size - 2 * frame.props.ring).toBe(size)
    expect(frame.props.ring).toBeLessThanOrEqual(Math.max(2, size * 0.06))
    expect(StyleSheet.flatten(view.UNSAFE_getByType(Image).props.style)).toMatchObject({ width: size, height: size })
    view.unmount()
  }
})

it.each(PROFILE_BORDERS)('previews $type on the real avatar, even when locked', borderDef => {
  const onPress = jest.fn()
  const view = render(<BorderSwatch label={borderDef.label} borderDef={borderDef} avatarUri="https://example.com/photo.png" selected={false} unlocked={false} onPress={onPress} />)
  expect(view.UNSAFE_getByType(ProfileAvatar).props).toMatchObject({ uri: 'https://example.com/photo.png', border: borderDef.type })
})
