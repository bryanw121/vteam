import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { NotificationPopup } from '../components/NotificationPopup'
import type { Notification } from '../types'

jest.mock('@expo/vector-icons/Ionicons', () => () => null)

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: Math.random().toString(),
    user_id: 'user-1',
    title: 'Test notification',
    body: 'This is the body text',
    notification_type: 'event_announcement',
    data: {},
    read_at: null,
    created_at: new Date().toISOString(),
    group_key: null,
    group_count: 1,
    last_activity_at: new Date().toISOString(),
    ...overrides,
  }
}

const BASE_PROPS = {
  visible: true,
  loading: false,
  unreadCount: 0,
  insetTop: 44,
  windowWidth: 390,
  onDismiss: jest.fn(),
  onOpenItem: jest.fn(),
  onMarkAllRead: jest.fn(),
  onSeeAll: jest.fn(),
}

describe('NotificationPopup', () => {
  beforeEach(() => jest.clearAllMocks())

  // ── Visibility ──────────────────────────────────────────────────────────────

  it('renders nothing when visible is false', () => {
    render(<NotificationPopup {...BASE_PROPS} visible={false} items={[]} />)
    expect(screen.queryByText('Notifications')).toBeNull()
  })

  it('renders the header when visible', () => {
    render(<NotificationPopup {...BASE_PROPS} items={[]} />)
    expect(screen.getByText('Notifications')).toBeTruthy()
    expect(screen.getByText('See all')).toBeTruthy()
  })

  // ── Scrollable list ─────────────────────────────────────────────────────────

  it('renders a FlatList with scrollEnabled', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeNotification({ id: `n-${i}`, title: `Notification ${i}` })
    )
    render(<NotificationPopup {...BASE_PROPS} items={items} />)

    const list = screen.getByTestId('notification-list')
    expect(list.props.scrollEnabled).toBe(true)
  })

  it('renders a FlatList with nestedScrollEnabled', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeNotification({ id: `n-${i}`, title: `Notification ${i}` })
    )
    render(<NotificationPopup {...BASE_PROPS} items={items} />)

    const list = screen.getByTestId('notification-list')
    expect(list.props.nestedScrollEnabled).toBe(true)
  })

  it('caps the list at 15 items even when more are provided', () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      makeNotification({ id: `n-${i}`, title: `Notification ${i}` })
    )
    render(<NotificationPopup {...BASE_PROPS} items={items} />)

    const list = screen.getByTestId('notification-list')
    expect(list.props.data).toHaveLength(15)
  })

  it('constrains the list height to maxHeight 320', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeNotification({ id: `n-${i}` })
    )
    render(<NotificationPopup {...BASE_PROPS} items={items} />)

    const list = screen.getByTestId('notification-list')
    expect(list.props.style).toMatchObject({ maxHeight: 320 })
  })

  // ── Empty states ────────────────────────────────────────────────────────────

  it('shows empty state when there are no notifications and not loading', () => {
    render(<NotificationPopup {...BASE_PROPS} items={[]} />)
    expect(screen.getByText("You're all caught up")).toBeTruthy()
  })

  it('shows a loading indicator when loading and items are empty', () => {
    render(<NotificationPopup {...BASE_PROPS} items={[]} loading />)
    expect(screen.getByTestId('notification-list').props.data).toHaveLength(0)
  })

  // ── Item rendering ──────────────────────────────────────────────────────────

  it('renders notification titles', () => {
    const items = [makeNotification({ id: 'a', title: 'You got kudos' })]
    render(<NotificationPopup {...BASE_PROPS} items={items} />)
    expect(screen.getByText('You got kudos')).toBeTruthy()
  })

  it('dims read notifications', () => {
    const items = [makeNotification({ id: 'a', read_at: new Date().toISOString() })]
    render(<NotificationPopup {...BASE_PROPS} items={items} />)
    // The row TouchableOpacity should have opacity 0.65
    const row = screen.getByText('Test notification').parent?.parent
    expect(row?.props.style).toMatchObject({ opacity: 0.65 })
  })

  it('does not dim unread notifications', () => {
    const items = [makeNotification({ id: 'a', read_at: null })]
    render(<NotificationPopup {...BASE_PROPS} items={items} />)
    const row = screen.getByText('Test notification').parent?.parent
    expect(row?.props.style).toMatchObject({ opacity: 1 })
  })

  // ── Interactions ────────────────────────────────────────────────────────────

  it('calls onDismiss when the backdrop is pressed', () => {
    const onDismiss = jest.fn()
    render(<NotificationPopup {...BASE_PROPS} items={[]} onDismiss={onDismiss} />)
    fireEvent.press(screen.getByTestId('notification-list').parent!.parent!)
    // The Pressable backdrop is the first child of the Modal
  })

  it('calls onOpenItem when a notification is tapped', () => {
    const onOpenItem = jest.fn()
    const item = makeNotification({ id: 'x', title: 'Tap me' })
    render(<NotificationPopup {...BASE_PROPS} items={[item]} onOpenItem={onOpenItem} />)
    fireEvent.press(screen.getByText('Tap me'))
    expect(onOpenItem).toHaveBeenCalledWith(item)
  })

  it('calls onSeeAll when "See all" is pressed', () => {
    const onSeeAll = jest.fn()
    render(<NotificationPopup {...BASE_PROPS} items={[]} onSeeAll={onSeeAll} />)
    fireEvent.press(screen.getByText('See all'))
    expect(onSeeAll).toHaveBeenCalledTimes(1)
  })

  it('shows "Read all" button only when there are unread notifications', () => {
    const { rerender } = render(
      <NotificationPopup {...BASE_PROPS} items={[]} unreadCount={0} />
    )
    expect(screen.queryByText('Read all')).toBeNull()

    rerender(<NotificationPopup {...BASE_PROPS} items={[]} unreadCount={3} />)
    expect(screen.getByText('Read all')).toBeTruthy()
  })

  it('calls onMarkAllRead when "Read all" is pressed', () => {
    const onMarkAllRead = jest.fn()
    render(
      <NotificationPopup {...BASE_PROPS} items={[]} unreadCount={2} onMarkAllRead={onMarkAllRead} />
    )
    fireEvent.press(screen.getByText('Read all'))
    expect(onMarkAllRead).toHaveBeenCalledTimes(1)
  })
})
