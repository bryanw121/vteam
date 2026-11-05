import React, { useEffect } from 'react'
import { Text } from 'react-native'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

jest.mock('../contexts/session', () => ({ useSession: () => ({ userId: null, loading: false, isGuest: true }) }))
jest.mock('../hooks/useUserSettings', () => ({ markBannerSeenOnAccount: jest.fn() }))
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }))
jest.mock('@expo/vector-icons/Ionicons', () => () => null)
jest.mock('../constants/tours', () => ({
  TOUR_TARGETS: { feedFilters: 'a', calendar: 'b', create: 'c', tab: (k: string) => `tab-${k}` },
  tourCompletionId: (id: string) => `tour-${id}-done`,
  TOURS: {
    intro: {
      id: 'intro',
      steps: [
        { target: 'a', title: 'Step A', body: 'First.' },
        { target: 'missing', title: 'Step Missing', body: 'Never shown.' },
        { target: 'c', title: 'Step C', body: 'Third.' },
      ],
    },
  },
}))

import { TourProvider, useTour, useTourTarget } from '../contexts/tour'
import { __resetSeenBanners, seenBannersNow, loadSeenBanners } from '../utils/seenBanners'
import type { TourControls } from '../types'

function FakeTarget({ id }: { id: string }) {
  const ref = useTourTarget(id)
  useEffect(() => {
    ref({ measureInWindow: cb => cb(20, 100, 80, 40) })
    return () => ref(null)
  }, [ref])
  return null
}

let controls: TourControls
function Grab() {
  controls = useTour()
  return <Text>{controls.active ? 'active' : 'idle'}</Text>
}

function setup() {
  render(
    <TourProvider>
      <FakeTarget id="a" />
      <FakeTarget id="c" />
      <Grab />
    </TourProvider>,
  )
}

/** The card renders invisibly first to measure itself; give it a height. */
function layoutCard() {
  fireEvent(screen.getByTestId('tour-card'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 160 } } })
}

describe('TourProvider', () => {
  beforeEach(() => __resetSeenBanners())

  it('walks next, skips a step whose target is not mounted, goes back, and completes', async () => {
    setup()
    act(() => controls.start('intro'))
    expect(await screen.findByText('Step A')).toBeTruthy()
    layoutCard()
    expect(screen.getByText('1 of 3')).toBeTruthy()
    expect(screen.queryByTestId('tour-back')).toBeNull()

    fireEvent.press(screen.getByTestId('tour-next'))
    await waitFor(() => expect(screen.getByText('Step C')).toBeTruthy(), { timeout: 4000 })
    expect(screen.getByText('3 of 3')).toBeTruthy()
    expect(screen.getByText('Done')).toBeTruthy()

    fireEvent.press(screen.getByTestId('tour-back'))
    await waitFor(() => expect(screen.getByText('Step A')).toBeTruthy(), { timeout: 4000 })

    fireEvent.press(screen.getByTestId('tour-next'))
    await waitFor(() => expect(screen.getByText('Step C')).toBeTruthy(), { timeout: 4000 })
    fireEvent.press(screen.getByTestId('tour-next'))
    await waitFor(() => expect(screen.queryByTestId('tour-overlay')).toBeNull())
    expect(screen.getByText('idle')).toBeTruthy()
    const seen = seenBannersNow() ?? await loadSeenBanners()
    expect(seen.has('tour-intro-done')).toBe(true)
  }, 15000)

  it('skip closes the tour without recording completion, and it can be restarted', async () => {
    setup()
    act(() => controls.start('intro'))
    expect(await screen.findByText('Step A')).toBeTruthy()
    fireEvent.press(screen.getByTestId('tour-skip'))
    expect(screen.queryByTestId('tour-overlay')).toBeNull()
    const seen = seenBannersNow() ?? await loadSeenBanners()
    expect(seen.has('tour-intro-done')).toBe(false)

    act(() => controls.start('intro'))
    expect(await screen.findByText('Step A')).toBeTruthy()
    act(() => controls.stop())
    expect(screen.queryByTestId('tour-overlay')).toBeNull()
  })
})
