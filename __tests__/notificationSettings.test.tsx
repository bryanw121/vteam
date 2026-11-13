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
let mockSettingsReads: string[]

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns: string) => {
        const chain: Record<string, unknown> = {}
        chain.eq = () => chain
        chain.maybeSingle = () => {
          if (table !== 'user_settings') return Promise.resolve({ data: null, error: null })
          // One read of the row: useMyProfile takes the switches from useUserSettings' query (#224).
          mockSettingsReads.push(columns)
          return Promise.resolve({
            data: mockLead === null && mockPrefs === null
              ? null
              : { user_id: 'u1', home_city_id: null, seen_banners: [], reminder_lead_minutes: mockLead ?? 120, home_city: null, notification_prefs: mockPrefs },
            error: null,
          })
        }
        chain.single = () => Promise.resolve({
          data: {
            id: 'u1', username: 'bryan', first_name: null, last_name: null, avatar_url: null, position: [],
            skill_level: null, created_at: 'x', selected_border: null, selected_card_bg: null, bio: null,
          },
          error: null,
        })
        return chain
      },
      update: () => ({ eq: () => Promise.reject(new Error(`unexpected ${table} update`)) }),
      upsert: (patch: Record<string, unknown>) => {
        if (table !== 'user_settings') return Promise.reject(new Error(`unexpected ${table} upsert`))
        // Notification switches (useMyProfile) are held until the test releases them; lead time saves at once.
        if ('notification_prefs' in patch) return new Promise(release => { mockUpdates.push({ patch, release }) })
        mockUpserts.push(patch)
        return Promise.resolve({ error: null })
      },
    }),
  },
}))

/** The per-type switches (the New game alerts card's own switches come first on the screen). */
function prefSwitches(view: ReturnType<typeof render>) {
  return view.UNSAFE_getAllByType(Switch).filter(s => !String(s.props.testID ?? '').startsWith('game-alerts'))
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve()
  })
}

let mockPrefs: unknown = null

beforeEach(() => {
  __resetQueryCache()
  mockUpdates = []
  mockUpserts = []
  mockLead = 120
  mockSettingsReads = []
  mockPrefs = null
})

describe('notification settings', () => {
  it('flipping two switches quickly saves both (latest prefs win) with no false error', async () => {
    const view = render(<NotificationSettingsScreen />)
    await flush()
    const switches = prefSwitches(view)

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
    const switches = prefSwitches(view)
    act(() => { fireEvent(switches[0], 'valueChange', false) })
    await act(async () => { mockUpdates[0].release({ error: { message: 'denied' } }) })
    await flush()
    expect(view.getByText('Could not save settings. Please try again.')).toBeTruthy()
  })

  it('reads user_settings once for the switches and the reminder time (#224)', async () => {
    render(<NotificationSettingsScreen />)
    await flush()
    expect(mockSettingsReads).toHaveLength(1)
    expect(mockSettingsReads[0]).toContain('notification_prefs')
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
    const pushReminder = prefSwitches(view).find(s => s.props.accessibilityLabel === 'Event reminders')
    expect(pushReminder?.props.disabled).toBe(true)
  })

  it('new game alerts: taps are saved together, as one game_alerts object', async () => {
    jest.useFakeTimers()
    try {
      const view = render(<NotificationSettingsScreen />)
      await flush()
      expect(view.getByTestId('game-alerts-summary').props.children).toBe('New games from your clubs, at most 3 a day.')
      act(() => { fireEvent(view.getByTestId('game-alerts-hosts'), 'valueChange', true) })
      act(() => { fireEvent.press(view.getByTestId('game-alerts-surfaces-sand')) })
      expect(mockUpserts.filter(p => 'game_alerts' in p)).toHaveLength(0)
      await act(async () => { jest.advanceTimersByTime(700) })
      const saved = mockUpserts.filter(p => 'game_alerts' in p)
      expect(saved).toHaveLength(1)
      expect(saved[0].game_alerts).toEqual({ clubs: true, hosts: true, surfaces: ['sand'], levels: [], times: [] })
    } finally {
      jest.useRealTimers()
    }
  })
})
