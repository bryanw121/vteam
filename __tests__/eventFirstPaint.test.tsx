/**
 * event_first_paint (#347): sent once, only for a web launch that opened on an event page.
 */
import { renderHook } from '@testing-library/react-native'
import { Platform } from 'react-native'

const mockTrack = jest.fn()
let mockLanded = true
jest.mock('../lib/analytics', () => ({
  track: (...a: unknown[]) => mockTrack(...a),
  landedOnEventPage: () => mockLanded,
  msSinceOpen: () => 1234,
}))

import { useEventFirstPaint, __resetEventFirstPaint } from '../hooks/event/useEventFirstPaint'

const realOS = Platform.OS
beforeEach(() => {
  mockTrack.mockReset()
  mockLanded = true
  __resetEventFirstPaint()
  Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true })
})
afterAll(() => Object.defineProperty(Platform, 'OS', { value: realOS, configurable: true }))

it('waits for the event, then sends once with the time since the page was shown', () => {
  const { rerender } = renderHook(({ shown }: { shown: boolean }) => useEventFirstPaint(shown), { initialProps: { shown: false } })
  expect(mockTrack).not.toHaveBeenCalled()
  rerender({ shown: true })
  expect(mockTrack).toHaveBeenCalledWith('event_first_paint', expect.objectContaining({ ms: 1234, preloaded: false, seeded: false }))
  rerender({ shown: false })
  rerender({ shown: true })
  expect(mockTrack).toHaveBeenCalledTimes(1)
})

it('nothing when the launch opened elsewhere, or on native', () => {
  mockLanded = false
  renderHook(() => useEventFirstPaint(true))
  expect(mockTrack).not.toHaveBeenCalled()
  mockLanded = true
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
  renderHook(() => useEventFirstPaint(true))
  expect(mockTrack).not.toHaveBeenCalled()
})
