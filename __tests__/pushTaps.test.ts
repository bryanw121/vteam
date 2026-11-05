import { Platform } from 'react-native'

const mockListeners: ((r: unknown) => void)[] = []
let mockLast: unknown = null
const mockRemove = jest.fn()

const mockNotifications = {
  addNotificationResponseReceivedListener: (fn: (r: unknown) => void) => {
    mockListeners.push(fn)
    return { remove: mockRemove }
  },
  getLastNotificationResponseAsync: () => Promise.resolve(mockLast),
}
// jest can't run the real dynamic import(); hand the module in instead.
const load = (() => Promise.resolve(mockNotifications)) as unknown as NonNullable<Parameters<typeof subscribeToPushTaps>[1]>
jest.mock('../lib/supabase', () => ({ supabase: {} }))
jest.mock('../lib/sessionUser', () => ({ getSessionUser: jest.fn() }))

import { __resetOpenedPushes, pushDeepLink, subscribeToPushTaps } from '../utils/pushNotifications'

const EVENT = '33333333-3333-4333-8333-333333333333'
const CONV = '44444444-4444-4444-8444-444444444444'

const response = (id: string, data: Record<string, unknown>) => ({
  actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
  notification: { request: { identifier: id, content: { data } } },
})

async function flush() {
  for (let i = 0; i < 3; i++) await new Promise(r => setTimeout(r, 0))
}

describe('pushDeepLink', () => {
  it('opens the deep link of any notification push', () => {
    expect(pushDeepLink({ deep_link: `/event/${EVENT}` })).toBe(`/event/${EVENT}`)
    expect(pushDeepLink({ deep_link: `/event/${EVENT}?tab=1`, event_id: EVENT })).toBe(`/event/${EVENT}?tab=1`)
  })

  it('opens the conversation of a chat push (no deep link)', () => {
    expect(pushDeepLink({ conversation_id: CONV })).toBe(`/chat/${CONV}`)
  })

  it('falls back to the event when only its id is there', () => {
    expect(pushDeepLink({ event_id: EVENT })).toBe(`/event/${EVENT}`)
  })

  it('rejects anything that is not an in-app path', () => {
    for (const deep_link of ['https://evil.example', '//evil.example', '/\\evil', 'javascript:alert(1)']) {
      expect(pushDeepLink({ deep_link })).toBeNull()
    }
    expect(pushDeepLink({ conversation_id: '../x' })).toBeNull()
    expect(pushDeepLink({ event_id: 5 })).toBeNull()
    expect(pushDeepLink(null)).toBeNull()
  })
})

describe('subscribeToPushTaps', () => {
  const originalOS = Platform.OS
  beforeEach(() => {
    mockListeners.length = 0
    mockLast = null
    mockRemove.mockClear()
    __resetOpenedPushes()
    Platform.OS = 'ios'
  })
  afterAll(() => { Platform.OS = originalOS })

  it('routes later taps and the push that launched the app, each once', async () => {
    mockLast = response('launch', { deep_link: `/event/${EVENT}` })
    const open = jest.fn()
    const stop = subscribeToPushTaps(open, load)
    await flush()
    expect(open).toHaveBeenCalledWith(`/event/${EVENT}`)

    // The same launch push reported again by the listener is not opened twice.
    mockListeners[0](mockLast)
    mockListeners[0](response('chat', { conversation_id: CONV }))
    expect(open.mock.calls).toEqual([[`/event/${EVENT}`], [`/chat/${CONV}`]])

    stop()
    expect(mockRemove).toHaveBeenCalled()
  })

  it('ignores a push without a usable link', async () => {
    const open = jest.fn()
    subscribeToPushTaps(open, load)
    await flush()
    mockListeners[0](response('bad', { deep_link: 'https://evil.example' }))
    expect(open).not.toHaveBeenCalled()
  })

  it('does nothing on web', async () => {
    Platform.OS = 'web'
    const open = jest.fn()
    subscribeToPushTaps(open, load)
    await flush()
    expect(mockListeners).toHaveLength(0)
  })
})
