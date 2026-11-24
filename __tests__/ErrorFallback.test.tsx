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

const mockHandleChunk = jest.fn()
jest.mock('../lib/staleBuild', () => ({ handleChunkError: () => mockHandleChunk() }))

import { act } from '@testing-library/react-native'
import { ErrorFallback } from '../components/ErrorFallback'
import { CRASH_COPY, UPDATE_COPY } from '../constants/copy'
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

describe('ErrorFallback: a deploy took the screen\'s code away (#359)', () => {
  const chunkError = Object.assign(new Error('Loading module https://x/_expo/static/js/web/leagues-abc.js failed.'), { name: 'AsyncRequireError' })

  it('is not a crash: shows "updating" while the tab reloads into the new build', async () => {
    mockHandleChunk.mockResolvedValue('reload')
    render(<ErrorFallback resetError={jest.fn()} error={chunkError} />)
    await act(async () => {})
    expect(screen.getByText(UPDATE_COPY.updatingTitle)).toBeTruthy()
    expect(mockNoteCrash).not.toHaveBeenCalled()
    expect(mockHandleChunk).toHaveBeenCalledTimes(1)
  })

  it('offline: says the screen could not load, and Try again resets it', async () => {
    mockHandleChunk.mockResolvedValue('offline')
    const reset = jest.fn()
    render(<ErrorFallback resetError={reset} error={chunkError} />)
    await act(async () => {})
    expect(screen.getByText(UPDATE_COPY.offlineTitle)).toBeTruthy()
    fireEvent.press(screen.getByText(UPDATE_COPY.retry))
    expect(reset).toHaveBeenCalledTimes(1)
    expect(mockNoteCrash).not.toHaveBeenCalled()
  })

  it('same build, file really missing: the crash screen as before', async () => {
    mockHandleChunk.mockResolvedValue('crash')
    mockNoteCrash.mockReturnValue(1)
    render(<ErrorFallback resetError={jest.fn()} error={chunkError} />)
    await act(async () => {})
    expect(screen.getByText(CRASH_COPY.title)).toBeTruthy()
    expect(mockNoteCrash).toHaveBeenCalledTimes(1)
  })

  it('any other error goes straight to the crash screen', () => {
    mockNoteCrash.mockReturnValue(1)
    render(<ErrorFallback resetError={jest.fn()} error={new TypeError('x is undefined')} />)
    expect(screen.getByText(CRASH_COPY.title)).toBeTruthy()
    expect(mockHandleChunk).not.toHaveBeenCalled()
  })
})
