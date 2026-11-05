import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import { ExternalSessionCard } from '../components/ExternalSessionCard'
import type { ExternalSession } from '../types'

jest.mock('../lib/openExternalUrl', () => ({ openExternalUrl: jest.fn(async () => true) }))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { openExternalUrl } = require('../lib/openExternalUrl') as { openExternalUrl: jest.Mock }

const session: ExternalSession = {
  id: 'volleyworld-2026-10-25-19:30-pflugerville',
  source_id: 'volleyworld',
  title: 'Open Gym',
  venue: 'Volleyworld Pflugerville',
  city: 'Pflugerville',
  surface: 'indoor',
  session_type: 'Open play',
  level: null,
  price: '$12',
  starts_at: '2026-10-26T00:30:00.000Z',
  ends_at: '2026-10-26T02:00:00.000Z',
  signup_url: 'https://volleyworld.arketa.co/schedule',
  signup_label: null,
  note: null,
  verified_at: null,
  region: 'austin',
}

const respond = (body: unknown, status = 200) => {
  global.fetch = jest.fn(async () => ({ ok: status === 200, status, json: async () => body })) as unknown as typeof fetch
}

describe('ExternalSessionCard last-mile check', () => {
  const realFetch = global.fetch
  afterEach(() => { global.fetch = realFetch; openExternalUrl.mockClear() })

  it('shows the new time for a changed session (live Volleyworld shape: session.start, no occurrence)', async () => {
    respond({
      id: session.id, sourceId: 'volleyworld', published: true, status: 'changed', changes: ['start', 'end'],
      session: { id: 'volleyworld-2026-10-25-20:30-pflugerville', date: '2026-10-25', start: '20:30', end: '22:00', timezone: 'America/Chicago' },
      checkedAt: '2026-10-25T20:00:00.000Z',
    })
    const screen = render(<ExternalSessionCard session={session} />)
    await act(async () => { fireEvent.press(screen.getByTestId('external-session-card')) })
    expect(openExternalUrl).not.toHaveBeenCalled()
    if (process.env.TZ === 'America/Chicago') {
      expect(screen.getByText(/Now Sun, Oct 25 · 8:30–10pm\./)).toBeTruthy()
      expect(screen.getByTestId('external-session-finding').props.children).toBe('New time: Sun, Oct 25 · 8:30–10pm')
    }
    expect(screen.getByText('The time changed')).toBeTruthy()
    await act(async () => { fireEvent.press(screen.getByTestId('confirm-dialog-confirm')) })
    expect(openExternalUrl).toHaveBeenCalledWith(session.signup_url)
  })

  it('does not open a cancelled session; offers to open the venue page anyway', async () => {
    respond({ id: session.id, status: 'canceled' })
    const screen = render(<ExternalSessionCard session={session} />)
    await act(async () => { fireEvent.press(screen.getByTestId('external-session-card')) })
    expect(screen.getAllByText('Cancelled at the venue')).toHaveLength(2) // dialog title + line on the card
    expect(openExternalUrl).not.toHaveBeenCalled()
    expect(screen.getByText('Open venue page anyway')).toBeTruthy()
  })

  it('opens straight away when the id is unknown to Schelagg (400)', async () => {
    respond({ error: 'unknown session id' }, 400)
    const screen = render(<ExternalSessionCard session={session} />)
    await act(async () => { fireEvent.press(screen.getByTestId('external-session-card')) })
    expect(openExternalUrl).toHaveBeenCalledWith(session.signup_url)
    expect(screen.queryByTestId('confirm-dialog')).toBeNull()
  })
})
