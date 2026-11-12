import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'

jest.mock('../contexts/session', () => ({ useSession: () => ({ userId: null, loading: false, isGuest: true }) }))
jest.mock('../hooks/useUserSettings', () => ({
  useUserSettings: () => ({ settings: undefined, isLoading: false }),
  markBannerSeenOnAccount: jest.fn(),
}))
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {}
  return { __esModule: true, default: { getItem: jest.fn(async (k: string) => store[k] ?? null), setItem: jest.fn(async (k: string, v: string) => { store[k] = v }) } }
})
jest.mock('@expo/vector-icons/Ionicons', () => () => null)
const mockStartTour = jest.fn()
jest.mock('../contexts/tour', () => ({ useTour: () => ({ start: mockStartTour, stop: jest.fn(), active: false }) }))

import { OneTimeBanner } from '../components/ui/OneTimeBanner'
import { __resetSeenBanners } from '../utils/seenBanners'

const banner = { id: 'test-banner-v1', title: 'Hello there', body: 'Only once.' }

describe('OneTimeBanner', () => {
  beforeEach(() => __resetSeenBanners())

  it('shows on the first visit, can be dismissed, and never shows again', async () => {
    const first = render(<OneTimeBanner banner={banner} />)
    expect(await screen.findByText('Hello there')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Dismiss'))
    expect(screen.queryByText('Hello there')).toBeNull()
    first.unmount()

    render(<OneTimeBanner banner={banner} />)
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByText('Hello there')).toBeNull()
  })

  it('counts as seen once shown, even without dismissing', async () => {
    const first = render(<OneTimeBanner banner={{ ...banner, id: 'other-v1' }} />)
    expect(await screen.findByText('Hello there')).toBeTruthy()
    first.unmount()
    render(<OneTimeBanner banner={{ ...banner, id: 'other-v1' }} />)
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByText('Hello there')).toBeNull()
  })

  it('a new id shows again', async () => {
    render(<OneTimeBanner banner={{ ...banner, id: 'fresh-v2' }} />)
    expect(await screen.findByText('Hello there')).toBeTruthy()
  })

  it('runs its action (start a tour) and hides', async () => {
    render(<OneTimeBanner banner={{ ...banner, id: 'action-v1', action: { label: 'Check out our tour', type: 'startTour', tourId: 'intro' } }} />)
    fireEvent.press(await screen.findByText('Check out our tour'))
    expect(mockStartTour).toHaveBeenCalledWith('intro', 'banner')
    expect(screen.queryByText('Hello there')).toBeNull()
  })
})
