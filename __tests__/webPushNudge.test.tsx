/**
 * "Get a reminder before this game?" (#189, components/event/WebPushNudge):
 * web only, while push can still be turned on, gone for good once dismissed.
 */
import React from 'react'
import { Platform } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

let mockState = 'ask'
const mockEnable = jest.fn()
let mockSeen = new Set<string>()
const mockMarkDevice = jest.fn()
const mockMarkAccount = jest.fn()

jest.mock('../utils/pushNotifications', () => ({
  getWebPushState: () => Promise.resolve(mockState),
  enableWebPush: () => mockEnable(),
}))
jest.mock('../utils/seenBanners', () => ({
  loadSeenBanners: () => Promise.resolve(mockSeen),
  markBannerSeenOnDevice: (id: string) => mockMarkDevice(id),
}))
jest.mock('../hooks/useUserSettings', () => ({
  useUserSettings: () => ({ settings: { seen_banners: [] }, isLoading: false }),
  markBannerSeenOnAccount: (u: string, id: string) => mockMarkAccount(u, id),
}))
jest.mock('../contexts/session', () => ({ useSession: () => ({ userId: 'u1', isGuest: false, loading: false }) }))
jest.mock('../lib/analytics', () => ({ track: jest.fn() }))

import { WebPushNudge } from '../components/event/WebPushNudge'
import { WEB_PUSH_NUDGE_ID } from '../constants/copy'

const realOS = Platform.OS
beforeEach(() => {
  Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true })
  mockState = 'ask'; mockSeen = new Set(); mockEnable.mockReset(); mockMarkDevice.mockReset(); mockMarkAccount.mockReset()
})
afterAll(() => { Object.defineProperty(Platform, 'OS', { value: realOS, configurable: true }) })

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

it('offers one-tap notifications and hides once they are on', async () => {
  mockEnable.mockResolvedValue('on')
  render(<WebPushNudge onOpenSettings={jest.fn()} />)
  await flush()
  expect(screen.getByTestId('web-push-nudge')).toBeTruthy()
  await act(async () => { fireEvent.press(screen.getByTestId('web-push-nudge-action')) })
  await flush()
  expect(mockEnable).toHaveBeenCalledTimes(1)
  expect(screen.queryByTestId('web-push-nudge')).toBeNull()
})

it('on an iPhone tab, sends the player to the install steps', async () => {
  mockState = 'needs-install'
  const open = jest.fn()
  render(<WebPushNudge onOpenSettings={open} />)
  await flush()
  fireEvent.press(screen.getByTestId('web-push-nudge-action'))
  expect(open).toHaveBeenCalled()
  expect(mockEnable).not.toHaveBeenCalled()
})

it('dismissing records it on the device and the account', async () => {
  render(<WebPushNudge onOpenSettings={jest.fn()} />)
  await flush()
  fireEvent.press(screen.getByTestId('web-push-nudge-dismiss'))
  expect(screen.queryByTestId('web-push-nudge')).toBeNull()
  expect(mockMarkDevice).toHaveBeenCalledWith(WEB_PUSH_NUDGE_ID)
  expect(mockMarkAccount).toHaveBeenCalledWith('u1', WEB_PUSH_NUDGE_ID)
})

it('never shows once dismissed, when push is on or blocked, or in the apps', async () => {
  mockSeen = new Set([WEB_PUSH_NUDGE_ID])
  const a = render(<WebPushNudge onOpenSettings={jest.fn()} />)
  await flush()
  expect(screen.queryByTestId('web-push-nudge')).toBeNull()
  a.unmount()
  mockSeen = new Set()
  for (const s of ['on', 'blocked', 'unsupported']) {
    mockState = s
    const r = render(<WebPushNudge onOpenSettings={jest.fn()} />)
    await flush()
    expect(screen.queryByTestId('web-push-nudge')).toBeNull()
    r.unmount()
  }
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
  mockState = 'ask'
  render(<WebPushNudge onOpenSettings={jest.fn()} />)
  await flush()
  expect(screen.queryByTestId('web-push-nudge')).toBeNull()
})
