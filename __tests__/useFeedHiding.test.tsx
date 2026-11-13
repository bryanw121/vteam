/** #217 part 3: hiding on the Events feed, without the screen. */
import { act, renderHook } from '@testing-library/react-native'
import type { EventWithDetails, HiddenFeedEntry } from '../types'

let mockUser: string | null = 'u1'
let mockEntries: HiddenFeedEntry[] = []
const mockHide = jest.fn()
const mockRestore = jest.fn()
const mockRequireSignIn = jest.fn(() => false)
const mockToast = jest.fn()

jest.mock('../contexts/session', () => ({ useSession: () => ({ userId: mockUser, isGuest: !mockUser }) }))
jest.mock('../hooks/useHiddenFeed', () => ({
  useHiddenFeed: () => ({ entries: mockEntries, hide: mockHide, restore: mockRestore }),
}))
jest.mock('../hooks/useRequireSignIn', () => ({ useRequireSignIn: () => mockRequireSignIn }))
jest.mock('../lib/toast', () => ({ toast: { show: (o: unknown) => mockToast(o) } }))

import { useFeedHiding } from '../hooks/useFeedHiding'

const host: HiddenFeedEntry = { kind: 'host', key: 'h1', label: 'Ana' }
const game = (f: Partial<EventWithDetails> = {}) =>
  ({ id: 'e1', title: 'Tuesday 6s', created_by: 'h1', event_date: '2026-11-20T00:00:00Z', event_tags: [], my_attendance: [], ...f }) as unknown as EventWithDetails

beforeEach(() => {
  mockUser = 'u1'; mockEntries = [host]
  mockHide.mockReset(); mockRestore.mockReset(); mockRequireSignIn.mockClear(); mockToast.mockReset()
})

it('hides a host’s games, but never one the player is going to', () => {
  const { result } = renderHook(() => useFeedHiding())
  expect(result.current.anyHidden).toBe(true)
  expect(result.current.isHiddenForMe(game())).toBe(true)
  const going = game({ my_attendance: [{ user_id: 'u1', status: 'attending' }] } as unknown as Partial<EventWithDetails>)
  expect(result.current.isHiddenForMe(going)).toBe(false)
})

it('toggles a revealed day', () => {
  const { result } = renderHook(() => useFeedHiding())
  act(() => result.current.toggleReveal('2026-11-20'))
  expect(result.current.revealedKeys.has('2026-11-20')).toBe(true)
  act(() => result.current.toggleReveal('2026-11-20'))
  expect(result.current.revealedKeys.size).toBe(0)
})

it('opens the menu for a signed-in player, hides with Undo, and closes', () => {
  const { result } = renderHook(() => useFeedHiding())
  act(() => result.current.openHideMenu(game()))
  expect(result.current.hideTarget?.id).toBe('e1')
  expect(result.current.hideOptionsFor.length).toBeGreaterThan(0)
  const option = result.current.hideOptionsFor[0]
  act(() => result.current.pickHideOption(option))
  expect(result.current.hideTarget).toBeNull()
  expect(mockHide).toHaveBeenCalledWith(option.entry)
  const shown = mockToast.mock.calls[0][0] as { action: { onPress: () => void } }
  shown.action.onPress()
  expect(mockRestore).toHaveBeenCalledWith([host])
})

it('sends a guest to sign in instead of opening the menu', () => {
  mockUser = null
  const { result } = renderHook(() => useFeedHiding())
  act(() => result.current.openHideMenu(game()))
  expect(mockRequireSignIn).toHaveBeenCalled()
  expect(result.current.hideTarget).toBeNull()
})

it('unhides every entry that matched the item', () => {
  const { result } = renderHook(() => useFeedHiding())
  act(() => result.current.unhideItem(game()))
  expect(mockRestore).toHaveBeenCalledWith([])
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Showing again: Ana' }))
})
