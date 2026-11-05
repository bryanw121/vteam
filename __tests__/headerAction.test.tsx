import React from 'react'
import { Share, StyleSheet, View } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { EventHeaderActions } from '../components/event/EventHeaderActions'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 34, left: 0, right: 0 }),
}))

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) ?? {}

/** Height/width a control actually reserves: explicit size or min size. */
function target(testID: string) {
  const s = flat(screen.getByTestId(testID)) as { width?: number; height?: number; minHeight?: number }
  return { height: s.height ?? s.minHeight ?? 0, width: s.width }
}

function renderHeader(over: Partial<React.ComponentProps<typeof EventHeaderActions>> = {}) {
  const props = {
    eventId: 'e1',
    title: 'Open Play',
    canManage: true,
    deleting: false,
    onBack: jest.fn(),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
    ...over,
  }
  render(<EventHeaderActions {...props} />)
  return props
}

describe('event header controls are >=44pt targets (#39)', () => {
  it('back and the overflow are 44pt square', () => {
    renderHeader()
    expect(target('event-back-button')).toEqual({ height: 44, width: 44 })
    expect(target('event-more-button')).toEqual({ height: 44, width: 44 })
  })

  it('Share and Edit are labelled buttons at least 44pt tall', () => {
    renderHeader()
    expect(target('event-share-button').height).toBeGreaterThanOrEqual(44)
    expect(target('event-edit-button').height).toBeGreaterThanOrEqual(44)
    expect(screen.getByText('Share')).toBeTruthy()
    expect(screen.getByText('Edit')).toBeTruthy()
  })

  it('every control has an accessibility label', () => {
    renderHeader()
    for (const label of ['Go back', 'Share this event', 'Edit this event', 'More event actions']) {
      expect(screen.getByLabelText(label)).toBeTruthy()
    }
  })

  it('keeps the target size while deleting (spinner in the overflow)', () => {
    renderHeader({ deleting: true })
    expect(target('event-more-button')).toEqual({ height: 44, width: 44 })
  })
})

describe('event header actions', () => {
  it('shows Share to everyone but Edit and the overflow only to hosts', () => {
    renderHeader({ canManage: false })
    expect(screen.getByText('Share')).toBeTruthy()
    expect(screen.queryByTestId('event-edit-button')).toBeNull()
    expect(screen.queryByTestId('event-more-button')).toBeNull()
  })

  it('Edit and back fire their callbacks', () => {
    const props = renderHeader()
    fireEvent.press(screen.getByTestId('event-edit-button'))
    fireEvent.press(screen.getByTestId('event-back-button'))
    expect(props.onEdit).toHaveBeenCalledTimes(1)
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })

  it('Delete lives in the overflow and only asks for confirmation', () => {
    jest.useFakeTimers()
    const measure = jest
      .spyOn(View.prototype as unknown as { measureInWindow: (cb: (...n: number[]) => void) => void }, 'measureInWindow')
      .mockImplementation(cb => cb(300, 40, 44, 44))
    try {
      const onManageCohosts = jest.fn()
      const props = renderHeader({ onManageCohosts })
      expect(screen.queryByText('Delete event')).toBeNull()
      fireEvent.press(screen.getByTestId('event-more-button'))
      expect(screen.getByText('Manage co-hosts')).toBeTruthy()
      fireEvent.press(screen.getByText('Delete event'))
      act(() => { jest.runAllTimers() })
      expect(props.onDelete).toHaveBeenCalledTimes(1)
    } finally {
      measure.mockRestore()
      jest.useRealTimers()
    }
  })
})

describe('Share sends an https link (#130)', () => {
  it('native share sheet: title + Central time + https link, never vteam://', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' })
    try {
      renderHeader({ eventId: 'abc-123', title: 'Sand Doubles', eventDate: '2026-10-31T21:00:00' })
      await act(async () => { fireEvent.press(screen.getByTestId('event-share-button')) })
      expect(share).toHaveBeenCalledTimes(1)
      const content = share.mock.calls[0][0] as { message: string; url?: string }
      const sent = `${content.message} ${content.url ?? ''}`
      expect(sent).toContain('https://vteamvolleyball.com/event/abc-123')
      expect(sent).not.toContain('vteam://')
      expect(content.message).toContain('"Sand Doubles" · Sat, Oct 31, 4:00 PM on vteam')
      // The link is sent once: as `url` on iOS, in the text elsewhere.
      expect(sent.match(/https:\/\//g)).toHaveLength(1)
    } finally {
      share.mockRestore()
    }
  })

  it('no longer builds links with expo-linking', () => {
    const src = readFileSync(resolve(__dirname, '../components/event/EventHeaderActions.tsx'), 'utf8')
    expect(src).not.toMatch(/createURL|window\.location\.href/)
    expect(src).toMatch(/shareUrl\(routes\.event\(eventId\)\)/)
  })
})

describe('guards against reintroducing sub-44pt header controls', () => {
  const src = readFileSync(resolve(__dirname, '../components/event/EventHeaderActions.tsx'), 'utf8')

  it('has no 36pt button left in the event header', () => {
    expect(src).not.toMatch(/width:\s*36/)
    expect(src).not.toMatch(/height:\s*36/)
  })

  it('builds on the ui primitives rather than raw Pressables', () => {
    expect(src).toMatch(/<IconButton[\s\S]*?size=\{44\}/)
    expect(src).toMatch(/<Button[\s\S]*?label="Share"[\s\S]*?size="touch"/)
    expect(src).toMatch(/<Button[\s\S]*?label="Edit"[\s\S]*?size="touch"/)
  })

  it('the event page still confirms before deleting', () => {
    const page = readFileSync(resolve(__dirname, '../app/(app)/event/[id].tsx'), 'utf8')
    expect(page).toMatch(/onDelete=\{\(\) => setDeleteConfirmVisible\(true\)\}/)
    expect(page).toMatch(/visible=\{deleteConfirmVisible\}/)
  })
})
