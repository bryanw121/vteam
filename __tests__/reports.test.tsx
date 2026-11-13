import React from 'react'
import fs from 'fs'
import path from 'path'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }))

const mockRpc = jest.fn()
jest.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }))
const mockToastError = jest.fn()
jest.mock('../lib/toast', () => ({ toast: { error: (...a: unknown[]) => mockToastError(...a), show: jest.fn() } }))

import { ReportSheet } from '../components/ReportSheet'
import { reportDueLabel } from '../utils/reports'
import { REPORT_REASONS } from '../constants/reports'

const target = { id: 'u-2', name: 'Ana Ruiz' }

beforeEach(() => { mockRpc.mockReset(); mockToastError.mockReset() })

describe('ReportSheet (#243)', () => {
  it('needs a reason, then sends report_user with the context and details', async () => {
    mockRpc.mockResolvedValue({ data: 'r-1', error: null })
    render(<ReportSheet visible onDismiss={jest.fn()} target={target} kind="dm" contextId="c-1" />)
    fireEvent.press(screen.getByTestId('report-send'))
    expect(mockRpc).not.toHaveBeenCalled()
    fireEvent.press(screen.getByTestId('report-reason-harassment'))
    fireEvent.changeText(screen.getByTestId('report-details'), '  kept messaging after I said stop  ')
    await act(async () => { fireEvent.press(screen.getByTestId('report-send')) })
    expect(mockRpc).toHaveBeenCalledWith('report_user', {
      p_target: 'u-2', p_kind: 'dm', p_context_id: 'c-1', p_reason: 'harassment', p_details: 'kept messaging after I said stop',
    })
    await waitFor(() => expect(screen.getByTestId('report-sent')).toBeTruthy())
    expect(screen.getByText(/won't know who reported them/)).toBeTruthy()
  })

  it('silences too when asked', async () => {
    mockRpc.mockResolvedValue({ data: 'r-1', error: null })
    const onSilence = jest.fn()
    render(<ReportSheet visible onDismiss={jest.fn()} target={target} kind="dm" offerSilence silenceByDefault onSilence={onSilence} />)
    expect(screen.getByText('Also silence Ana')).toBeTruthy()
    fireEvent.press(screen.getByTestId(`report-reason-${REPORT_REASONS[0].key}`))
    await act(async () => { fireEvent.press(screen.getByTestId('report-send')) })
    expect(onSilence).toHaveBeenCalled()
  })

  it('shows an error and stays open when the report fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'You already reported this.', code: 'P0001' } })
    render(<ReportSheet visible onDismiss={jest.fn()} target={target} kind="profile" />)
    fireEvent.press(screen.getByTestId('report-reason-spam'))
    await act(async () => { fireEvent.press(screen.getByTestId('report-send')) })
    expect(mockToastError).toHaveBeenCalled()
    expect(screen.queryByTestId('report-sent')).toBeNull()
  })
})

describe('reportDueLabel', () => {
  const created = '2026-11-12T00:00:00Z'
  it('counts down to the 24 h review target, then up', () => {
    expect(reportDueLabel(created, new Date('2026-11-12T04:00:00Z'))).toBe('due in 20 h')
    expect(reportDueLabel(created, new Date('2026-11-13T00:10:00Z'))).toBe('due now')
    expect(reportDueLabel(created, new Date('2026-11-13T03:00:00Z'))).toBe('3 h overdue')
  })
})

describe('no fake reports', () => {
  it('no screen says someone was reported without writing a report', () => {
    for (const f of ['app/(app)/profile/[id].tsx', 'app/(app)/chat/[id].tsx']) {
      const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
      expect(src).not.toMatch(/has been reported to vteam|submitStubDmReport/)
    }
  })
})
