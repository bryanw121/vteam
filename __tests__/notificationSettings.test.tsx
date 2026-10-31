import React from 'react'
import { Switch } from 'react-native'
import { act, fireEvent, render } from '@testing-library/react-native'
import { __resetQueryCache } from '../lib/query'
import NotificationSettingsScreen from '../app/(app)/(tabs)/settings/notifications'

jest.mock('expo-router', () => ({ useFocusEffect: () => {} }))
jest.mock('../lib/sentry', () => ({ Sentry: { captureException: jest.fn() } }))
jest.mock('../hooks/useStackBackTitle', () => ({ useStackBackTitle: () => {} }))
jest.mock('../contexts/session', () => ({
  useSession: () => ({ session: null, userId: 'u1', isGuest: false, loading: false }),
}))

type Update = { patch: Record<string, unknown>; release: (r: { error: unknown }) => void }
let mockUpdates: Update[]
let mockUpserts: Record<string, unknown>[]
let mockLead: number | null

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => table === 'user_settings' ? ({
      select: () => {
        const chain: Record<string, unknown> = {}
        chain.eq = () => chain
        chain.maybeSingle = () => Promise.resolve({
          data: mockLead === null ? null : { user_id: 'u1', home_city_id: null, seen_banners: [], reminder_lead_minutes: mockLead, home_city: null },
          error: null,
        })
        return chain
      },
      upsert: (row: Record<string, unknown>) => { mockUpserts.push(row); return Promise.resolve({ error: null }) },
    }) : ({
      select: () => {
        const chain: Record<string, unknown> = {}
        chain.eq = () => chain
        chain.single = () => Promise.resolve({
          data: {
            id: 'u1', username: 'bryan', first_name: null, last_name: null, avatar_url: null, position: [],
            skill_level: null, created_at: 'x', selected_border: null, selected_card_bg: null, bio: null,
            notification_prefs: mockPrefs,
          },
          error: null,
        })
        return chain
      },
      update: (patch: Record<string, unknown>) => ({
        eq: () => new Promise(release => { mockUpdates.push({ patch, release }) }),
      }),
    }),
  },
}))

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve()
  })
}

let mockPrefs: unknown = null

beforeEach(() => {
  __resetQueryCache()
  mockUpdates = []
  mockUpserts = []
  mockLead = 120
  mockPrefs = null
})

describe('notification settings', () => {
  it('flipping two switches quickly saves both (latest prefs win) with no false error', async () => {
    const view = render(<NotificationSettingsScreen />)
    await flush()
    const switches = view.UNSAFE_getAllByType(Switch)

    act(() => { fireEvent(switches[0], 'valueChange', false) })
    act(() => { fireEvent(switches[1], 'valueChange', false) })
    expect(mockUpdates).toHaveLength(1)
    expect(view.queryByText('Could not save settings. Please try again.')).toBeNull()

    await act(async () => { mockUpdates[0].release({ error: null }) })
    await flush()
    expect(mockUpdates).toHaveLength(2)
    const latest = mockUpdates[1].patch.notification_prefs as { in_app: Record<string, boolean> }
    expect(Object.values(latest.in_app).filter(v => v === false)).toHaveLength(2)

    await act(async () => { mockUpdates[1].release({ error: null }) })
    await flush()
    expect(view.queryByText('Could not save settings. Please try again.')).toBeNull()
  })

  it('still reports a real failure of the latest save', async () => {
    const view = render(<NotificationSettingsScreen />)
    await flush()
    const switches = view.UNSAFE_getAllByType(Switch)
    act(() => { fireEvent(switches[0], 'valueChange', false) })
    await act(async () => { mockUpdates[0].release({ error: { message: 'denied' } }) })
    await flush()
    expect(view.getByText('Could not save settings. Please try again.')).toBeTruthy()
  })

  it('has no "coming soon" label: push is live', async () => {
    const view = render(<NotificationSettingsScreen />)
    await flush()
    expect(view.queryByText(/coming soon/i)).toBeNull()
    expect(view.queryByText('Saved for when push is enabled')).toBeNull()
    expect(view.getByText('Push on this phone')).toBeTruthy()
  })
})

describe('Reminders', () => {
  it('shows the saved lead time and an example of the reminder', async () => {
    mockLead = 60
    const view = render(<NotificationSettingsScreen />)
    await flush()
    expect(view.getByTestId('reminder-lead-60').props.accessibilityState).toMatchObject({ checked: true })
    expect(view.getByTestId('reminder-lead-120').props.accessibilityState).toMatchObject({ checked: false })
    expect(view.getByText('Sand Doubles at 4:00 PM')).toBeTruthy()
    expect(view.getByText('Starts in 1 hour · Butler Park')).toBeTruthy()
  })

  it('defaults to 2 hours without a settings row', async () => {
    mockLead = null
    const view = render(<NotificationSettingsScreen />)
    await flush()
    expect(view.getByTestId('reminder-lead-120').props.accessibilityState).toMatchObject({ checked: true })
  })

  it('saves a new lead time to user_settings', async () => {
    const view = render(<NotificationSettingsScreen />)
    await flush()
    await act(async () => { fireEvent.press(view.getByTestId('reminder-lead-1440')) })
    await flush()
    expect(mockUpserts).toHaveLength(1)
    expect(mockUpserts[0]).toMatchObject({ user_id: 'u1', reminder_lead_minutes: 1440 })
    expect(view.getByText('Tomorrow at 4:00 PM · Butler Park')).toBeTruthy()
  })

  it('turning reminders off saves the event_reminder pref and hides the lead times', async () => {
    const view = render(<NotificationSettingsScreen />)
    await flush()
    act(() => { fireEvent(view.getByTestId('reminders-toggle'), 'valueChange', false) })
    const prefs = mockUpdates[0].patch.notification_prefs as { in_app: Record<string, boolean> }
    expect(prefs.in_app).toEqual({ event_reminder: false })
    await act(async () => { mockUpdates[0].release({ error: null }) })
    await flush()
    expect(view.queryByTestId('reminder-lead-120')).toBeNull()
  })

  it('with reminders off the lead chips are hidden and push for reminders is disabled', async () => {
    mockPrefs = { in_app: { event_reminder: false }, push: {} }
    const view = render(<NotificationSettingsScreen />)
    await flush()
    expect(view.queryByTestId('reminder-lead-60')).toBeNull()
    const pushReminder = view.UNSAFE_getAllByType(Switch).find(s => s.props.accessibilityLabel === 'Event reminders')
    expect(pushReminder?.props.disabled).toBe(true)
  })
})
