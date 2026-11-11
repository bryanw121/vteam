import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import { __resetToast, isNetworkError, toast } from '../lib/toast'
import { ToastHost } from '../components/ToastHost'
import { GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE } from '../constants/copy'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))

beforeEach(() => {
  __resetToast()
  jest.useFakeTimers()
})
afterEach(() => jest.useRealTimers())

describe('lib/toast (#228)', () => {
  it('shows one toast at a time: a new one replaces the current one', () => {
    const a = toast.show({ message: 'First' })
    toast.show({ message: 'Second', variant: 'success' })
    expect(toast.current()).toMatchObject({ message: 'Second', variant: 'success' })
    toast.hide(a) // an old id doesn't hide the newer toast
    expect(toast.current()?.message).toBe('Second')
    toast.hide()
    expect(toast.current()).toBeNull()
  })

  it('error() never shows a raw database message: offline reads as a connection problem', () => {
    toast.error("Couldn't join", new TypeError('Network request failed'))
    expect(toast.current()).toMatchObject({ title: "Couldn't join", message: NETWORK_ERROR_MESSAGE, variant: 'error' })
    toast.error("Couldn't join", { message: 'duplicate key value violates unique constraint' })
    expect(toast.current()?.message).toBe(GENERIC_ERROR_MESSAGE)
    expect(isNetworkError(new Error('Failed to fetch'))).toBe(true)
    expect(isNetworkError(new Error('permission denied'))).toBe(false)
  })
})

describe('ToastHost', () => {
  it('announces the toast and runs its action', () => {
    const retry = jest.fn()
    const view = render(<ToastHost />)
    expect(view.queryByTestId('toast')).toBeNull()
    act(() => { toast.error("Couldn't join", undefined, { label: 'Retry', onPress: retry }) })
    const shown = view.getByTestId('toast')
    expect(shown.props.role).toBe('alert')
    expect(view.getByText("Couldn't join")).toBeTruthy()
    fireEvent.press(view.getByTestId('toast-action'))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(toast.current()).toBeNull()
  })

  it('hides itself after its duration, and on dismiss', () => {
    const view = render(<ToastHost />)
    act(() => { toast.show({ message: 'Saved', duration: 1000 }) })
    expect(view.getByText('Saved')).toBeTruthy()
    act(() => { jest.advanceTimersByTime(1500) })
    expect(toast.current()).toBeNull()
    act(() => { toast.show({ message: 'Again' }) })
    fireEvent.press(view.getByTestId('toast-dismiss'))
    expect(toast.current()).toBeNull()
  })
})
