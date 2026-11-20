import React from 'react'
import { Modal } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { CourtQueueCard } from '../components/event/people/CourtQueueCard'
import { recordResult, startQueue } from '../utils/courtQueue'
import type { CourtQueue, CourtQueueRule } from '../types'

/** #333: the Courts card on the People tab, with the data hook stubbed. */

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const mockApply = jest.fn()
let mockQueue: CourtQueue | null = null
jest.mock('../hooks/event/useCourtQueue', () => ({
  useCourtQueue: () => ({ queue: mockQueue, saving: false, apply: mockApply, isLoading: false, error: null, refetch: jest.fn() }),
}))

const RULE: CourtQueueRule = { kind: 'stay', stayMax: 3 }
const now = Date.now()

function queueOf(state = startQueue([1, 2, 3, 4], 1), ended = false): CourtQueue {
  return { eventId: 'e1', rule: RULE, state, version: 4, ended, updatedAt: new Date(now - 2 * 60_000).toISOString() }
}

function renderCard(o: { canRun: boolean; myTeam?: number | null; teams?: number[]; startMs?: number }) {
  render(
    <CourtQueueCard
      eventId="e1"
      startMs={o.startMs ?? now - 10 * 60_000}
      durationMinutes={120}
      cancelled={false}
      teams={o.teams ?? [1, 2, 3, 4]}
      myTeam={o.myTeam ?? null}
      canRun={o.canRun}
    />,
  )
}

function closeSheets() {
  act(() => { screen.UNSAFE_getAllByType(Modal).forEach(m => m.props.onDismiss?.()) })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockQueue = null
})

describe('before the queue starts', () => {
  it('a player sees nothing', () => {
    renderCard({ canRun: false })
    expect(screen.queryByTestId('court-queue-card')).toBeNull()
  })

  it('the host is offered it once the game is on, and starts it with a rule', () => {
    renderCard({ canRun: true })
    fireEvent.press(screen.getByTestId('court-queue-start'))
    fireEvent.press(screen.getByTestId('court-queue-save'))
    closeSheets()
    expect(mockApply).toHaveBeenCalledWith(startQueue([1, 2, 3, 4], 1), RULE, { event: 'start' })
  })

  it('not offered the day before', () => {
    renderCard({ canRun: true, startMs: now + 24 * 60 * 60_000 })
    expect(screen.queryByTestId('court-queue-card')).toBeNull()
  })

  it('asks for saved teams first', () => {
    renderCard({ canRun: true, teams: [1] })
    expect(screen.getByText('Save at least two teams to run the courts.')).toBeTruthy()
    expect(screen.queryByTestId('court-queue-start')).toBeNull()
  })
})

describe('a running queue', () => {
  it('the host taps who won and the rotation moves on', () => {
    mockQueue = queueOf()
    renderCard({ canRun: true })
    fireEvent.press(screen.getByTestId('court-1-won-2'))
    expect(mockApply).toHaveBeenCalledWith(recordResult(startQueue([1, 2, 3, 4], 1), RULE, 0, 2), RULE, { event: 'result' })
  })

  it('a player sees where their team is, without the host controls', () => {
    mockQueue = queueOf()
    renderCard({ canRun: false, myTeam: 3 })
    expect(screen.getByText("You're on Green · up next")).toBeTruthy()
    expect(screen.getByText('Purple vs Red is playing now')).toBeTruthy()
    expect(screen.queryByTestId('court-1-won-1')).toBeNull()
    expect(screen.queryByTestId('court-queue-undo')).toBeNull()
    expect(screen.getByText('updated 2 min ago')).toBeTruthy()
  })

  it('a guest sees the courts and the line, with no banner', () => {
    mockQueue = queueOf()
    renderCard({ canRun: false })
    expect(screen.getByTestId('court-1')).toBeTruthy()
    expect(screen.getByTestId('court-queue-next-1')).toBeTruthy()
    expect(screen.queryByTestId('court-queue-banner')).toBeNull()
  })

  it('shows a streak and tonight\'s record', () => {
    mockQueue = queueOf(recordResult(startQueue([1, 2, 3, 4], 1), RULE, 0, 2))
    renderCard({ canRun: false })
    expect(screen.getByText('Red: 1 win in a row')).toBeTruthy()
    expect(screen.getByText('Red 1–0')).toBeTruthy()
    expect(screen.getByText('Purple 0–1')).toBeTruthy()
  })

  it('a team the host removed from the teams leaves the rotation on the next tap', () => {
    mockQueue = queueOf()
    renderCard({ canRun: true, teams: [1, 2, 3] })
    fireEvent.press(screen.getByTestId('court-1-won-1'))
    const [state] = mockApply.mock.calls[0]
    expect(state.queue).not.toContain(4)
  })

  it('End keeps the night and stops the controls', () => {
    mockQueue = queueOf()
    renderCard({ canRun: true })
    fireEvent.press(screen.getByTestId('court-queue-end'))
    expect(mockApply).toHaveBeenCalledWith(mockQueue.state, RULE, { ended: true, event: 'end' })
  })

  it('after it ends, the host can start again', () => {
    mockQueue = queueOf(startQueue([1, 2, 3, 4], 1), true)
    renderCard({ canRun: true })
    expect(screen.queryByTestId('court-1-won-1')).toBeNull()
    fireEvent.press(screen.getByTestId('court-queue-restart'))
    expect(mockApply).toHaveBeenCalledWith(startQueue([1, 2, 3, 4], 1), RULE, { event: 'start' })
  })
})
