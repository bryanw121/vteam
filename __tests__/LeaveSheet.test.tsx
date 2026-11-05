import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }))

import { LeaveSheet } from '../components/event/LeaveSheet'
import { LEAVE_COPY } from '../constants'
import { leaveConsequences } from '../utils/leaveConsequences'
import type { LeaveConsequence } from '../types'

const START_MS = Date.parse('2026-11-13T01:00:00Z')
const full: LeaveConsequence[] = leaveConsequences(
  { event_date: '2026-11-13T01:00:00', max_attendees: 12, requires_approval: false, price: 10, event_tags: [], hostName: 'Maya' },
  { count: 12, isFull: true, spotsLeft: 0, waitlistCount: 2 },
  { isHostOrCohost: false, paid: true },
  START_MS - 5 * 3_600_000,
)

function renderSheet(over: Partial<React.ComponentProps<typeof LeaveSheet>> = {}) {
  const onLeave = jest.fn()
  const onCancel = jest.fn()
  render(
    <LeaveSheet
      visible
      layout="sheet"
      subtitle="Starts in 5 hours · Thu 7:00 PM"
      lines={full}
      hostName="Maya"
      showReason
      leaving={false}
      onLeave={onLeave}
      onCancel={onCancel}
      {...over}
    />,
  )
  return { onLeave, onCancel }
}

describe.each(['sheet', 'dialog'] as const)('LeaveSheet (%s)', layout => {
  it('renders every line it is given', () => {
    renderSheet({ layout })
    expect(screen.getByText(LEAVE_COPY.title)).toBeTruthy()
    for (const l of full) expect(screen.getByTestId(`leave-line-${l.kind}`)).toBeTruthy()
    expect(screen.getByText('2 points')).toBeTruthy()
  })

  it('Stay in cancels and never leaves', () => {
    const { onLeave, onCancel } = renderSheet({ layout })
    fireEvent.press(screen.getByTestId('leave-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onLeave).not.toHaveBeenCalled()
  })

  it('Leave game passes the chosen reason and the note', () => {
    const { onLeave } = renderSheet({ layout })
    fireEvent.press(screen.getByTestId('leave-reason-sick'))
    fireEvent.changeText(screen.getByTestId('leave-note'), 'Feel better soon')
    fireEvent.press(screen.getByTestId('leave-confirm'))
    expect(onLeave).toHaveBeenCalledWith('sick', 'Feel better soon')
  })
})

describe('LeaveSheet reason', () => {
  it('is hidden when the host will not be told', () => {
    const { onLeave } = renderSheet({ showReason: false })
    expect(screen.queryByTestId('leave-reason')).toBeNull()
    expect(screen.queryByTestId('leave-note')).toBeNull()
    fireEvent.press(screen.getByTestId('leave-confirm'))
    expect(onLeave).toHaveBeenCalledWith(null, '')
  })

  it('tapping the chosen chip again clears it', () => {
    const { onLeave } = renderSheet()
    fireEvent.press(screen.getByTestId('leave-reason-work'))
    fireEvent.press(screen.getByTestId('leave-reason-work'))
    fireEvent.press(screen.getByTestId('leave-confirm'))
    expect(onLeave).toHaveBeenCalledWith(null, '')
  })

  it('the scrim is Stay in', () => {
    const { onCancel, onLeave } = renderSheet()
    fireEvent.press(screen.getByTestId('bottom-sheet-backdrop'))
    expect(onCancel).toHaveBeenCalled()
    expect(onLeave).not.toHaveBeenCalled()
  })

  it('nothing dismisses while the leave is in flight', () => {
    const { onCancel } = renderSheet({ leaving: true })
    fireEvent.press(screen.getByTestId('bottom-sheet-backdrop'))
    expect(onCancel).not.toHaveBeenCalled()
  })
})
