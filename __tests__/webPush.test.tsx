/**
 * Web push (#189): where push stands on a browser, the card for each state,
 * the service worker's tap message, and the manifest's colours.
 */
import React from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import { act, fireEvent, render } from '@testing-library/react-native'
import { applicationServerKey, isAppleMobile, pushTapLink, webPushState } from '../utils/webPushState'
import { theme } from '../constants/theme'
import { APP_NAME, WEB_PUSH_COPY } from '../constants/copy'
import type { WebPushEnv } from '../types'

const mockEnable = jest.fn()
const mockDisable = jest.fn()
jest.mock('../utils/pushNotifications', () => ({
  enableWebPush: () => mockEnable(),
  disableWebPush: () => mockDisable(),
  getWebPushState: () => Promise.resolve('ask'),
}))
jest.mock('../lib/analytics', () => ({ track: jest.fn() }))
jest.mock('../lib/toast', () => ({ toast: { show: jest.fn() } }))

import { WebPushCard } from '../components/settings/WebPushCard'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const env = (f: Partial<WebPushEnv> = {}): WebPushEnv => ({
  userAgent: DESKTOP, standalone: false, pushSupported: true, permission: 'default', subscribed: false, hasKey: true, ...f,
})

describe('webPushState', () => {
  it('iPhone Safari in a tab needs the Home Screen first', () => {
    expect(webPushState(env({ userAgent: IPHONE, pushSupported: false, permission: null }))).toBe('needs-install')
  })
  it('iPhone from the Home Screen can ask', () => {
    expect(webPushState(env({ userAgent: IPHONE, standalone: true }))).toBe('ask')
  })
  it('granted with a subscription is on; granted without one asks again', () => {
    expect(webPushState(env({ permission: 'granted', subscribed: true }))).toBe('on')
    expect(webPushState(env({ permission: 'granted', subscribed: false }))).toBe('ask')
  })
  it('denied is blocked', () => {
    expect(webPushState(env({ permission: 'denied' }))).toBe('blocked')
  })
  it('no Push API, or no key in this build, is unsupported', () => {
    expect(webPushState(env({ pushSupported: false }))).toBe('unsupported')
    expect(webPushState(env({ hasKey: false }))).toBe('unsupported')
  })
  it('iPadOS (a Mac UA with touch) counts as Apple mobile', () => {
    expect(isAppleMobile(DESKTOP, 5)).toBe(true)
    expect(isAppleMobile(DESKTOP, 0)).toBe(false)
  })
})

describe('service worker messages', () => {
  it('takes the deep link only from our tap message', () => {
    expect(pushTapLink({ type: 'vteam-push-tap', deep_link: '/event/x' })).toBe('/event/x')
    expect(pushTapLink({ type: 'other', deep_link: '/event/x' })).toBeNull()
    expect(pushTapLink('nope')).toBeNull()
  })
  it('the service worker never follows an outside link', () => {
    const sw = readFileSync(join(__dirname, '../public/sw.js'), 'utf8')
    expect(sw).toMatch(/startsWith\('\/'\) && !link\.startsWith\('\/\/'\)/)
    expect(sw.length).toBeLessThan(4096)
  })
})

it('decodes the VAPID key for PushManager', () => {
  expect(Array.from(applicationServerKey('BAEC'))).toEqual([4, 1, 2])
})

it('the manifest matches the app name and theme', () => {
  const m = JSON.parse(readFileSync(join(__dirname, '../public/manifest.webmanifest'), 'utf8'))
  expect(m.name).toBe(APP_NAME)
  expect(m.display).toBe('standalone')
  expect(m.background_color.toLowerCase()).toBe(theme.colors.background.toLowerCase())
  expect(m.theme_color.toLowerCase()).toBe(theme.colors.background.toLowerCase())
  const html = readFileSync(join(__dirname, '../app/+html.tsx'), 'utf8')
  expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
})

describe('WebPushCard', () => {
  beforeEach(() => { mockEnable.mockReset(); mockDisable.mockReset() })

  it('shows the install steps on iPhone Safari', () => {
    const r = render(<WebPushCard initialState="needs-install" />)
    expect(r.getByText(WEB_PUSH_COPY.installSteps[1])).toBeTruthy()
    expect(r.queryByTestId('web-push-enable')).toBeNull()
  })

  it('turns push on with one tap and then shows the switches', async () => {
    mockEnable.mockResolvedValue('on')
    const r = render(<WebPushCard initialState="ask"><>{null}</></WebPushCard>)
    await act(async () => { fireEvent.press(r.getByTestId('web-push-enable')) })
    expect(mockEnable).toHaveBeenCalledTimes(1)
    expect(r.getByTestId('web-push-on')).toBeTruthy()
  })

  it('blocked explains where to turn it back on', () => {
    const r = render(<WebPushCard initialState="blocked" />)
    expect(r.getByText(WEB_PUSH_COPY.blocked)).toBeTruthy()
  })

  it('on can be turned off for this device', async () => {
    mockDisable.mockResolvedValue(undefined)
    const r = render(<WebPushCard initialState="on" />)
    await act(async () => { fireEvent.press(r.getByTestId('web-push-disable')) })
    expect(mockDisable).toHaveBeenCalledTimes(1)
    expect(r.getByTestId('web-push-ask')).toBeTruthy()
  })
})
