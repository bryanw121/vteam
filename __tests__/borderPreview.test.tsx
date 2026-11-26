import React from 'react'
import { render } from '@testing-library/react-native'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { BorderSwatch } from '../components/profile/BorderSwatch'
import { PROFILE_BORDERS } from '../constants/badges'

jest.mock('../components/profile/LegendRing', () => ({ LegendBorder: ({ children }: any) => children }))

it.each(PROFILE_BORDERS)('previews $type on the real avatar, even when locked', borderDef => {
  const onPress = jest.fn()
  const view = render(<BorderSwatch label={borderDef.label} borderDef={borderDef} avatarUri="https://example.com/photo.png" selected={false} unlocked={false} onPress={onPress} />)
  expect(view.UNSAFE_getByType(ProfileAvatar).props).toMatchObject({ uri: 'https://example.com/photo.png', border: borderDef.type })
})
