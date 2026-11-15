import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a) } }))
const mockNoteCrash = jest.fn()
const mockRecover = jest.fn()
const mockPrepare = jest.fn()
jest.mock('../lib/crashRecovery', () => ({
  noteCrash: () => mockNoteCrash(),
  recoverFromCrash: () => mockRecover(),
  prepareCrashReport: () => mockPrepare(),
}))

import { ErrorFallback } from '../components/ErrorFallback'
import { CRASH_COPY } from '../constants/copy'
import { routes } from '../utils/routes'

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
})
afterEach(() => jest.useRealTimers())

describe('ErrorFallback (#316)', () => {
  it('first crash: Try again clears what was saved, then resets the screen', () => {
    mockNoteCrash.mockReturnValue(1)
    const reset = jest.fn()
    render(<ErrorFallback resetError={reset} />)
    expect(screen.getByText(CRASH_COPY.title)).toBeTruthy()
    fireEvent.press(screen.getByText(CRASH_COPY.tryAgain))
    expect(mockRecover).toHaveBeenCalledTimes(1)
    expect(reset).toHaveBeenCalledTimes(1)
    expect(mockNoteCrash).toHaveBeenCalledTimes(1)
  })

  it('first crash: Go to Events recovers, resets and opens Events', () => {
    mockNoteCrash.mockReturnValue(1)
    render(<ErrorFallback resetError={jest.fn()} />)
    fireEvent.press(screen.getByText(CRASH_COPY.goToEvents))
    jest.runAllTimers()
    expect(mockRecover).toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith(routes.app())
  })

  it('again within 30 s: offers a reload and a prefilled bug report instead', () => {
    mockNoteCrash.mockReturnValue(2)
    render(<ErrorFallback resetError={jest.fn()} />)
    expect(screen.getByText(CRASH_COPY.againTitle)).toBeTruthy()
    expect(screen.queryByText(CRASH_COPY.tryAgain)).toBeNull()
    fireEvent.press(screen.getByText(CRASH_COPY.report))
    jest.runAllTimers()
    expect(mockPrepare).toHaveBeenCalled()
    expect(mockRecover).toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith(routes.feedback('bug'))
  })
})
