import React from 'react'
import { Text, StyleSheet } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import {
  ScreenState, EmptyState, Chip, IconButton, ScreenHeader, ConfirmDialog, BottomSheet, ScreenContainer,
} from '../../components/ui'
import { theme } from '../../constants'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 34, left: 0, right: 0 }),
}))

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as any) ?? {}

describe('theme tokens', () => {
  it('exposes the new colour, gradient and size tokens', () => {
    expect(theme.colors.overlay).toBe('rgba(0,0,0,0.5)')
    expect(theme.colors.overlayLight).toBe('rgba(0,0,0,0.45)')
    expect(theme.colors.onPrimary).toBe('#FFFFFF')
    expect(theme.colors.medalGold).toBe('#FFD54F')
    expect(theme.gradients.brand).toHaveLength(3)
    expect(theme.font.size.smd).toBe(13)
    expect(theme.font.size.lgs).toBe(15)
  })
})

describe('ScreenState', () => {
  const child = <Text>content</Text>

  it('shows a spinner while loading with nothing to show', () => {
    render(<ScreenState loading>{child}</ScreenState>)
    expect(screen.getByTestId('screen-state-loading')).toBeTruthy()
    expect(screen.queryByText('content')).toBeNull()
  })

  it('keeps showing children while loading if data is ready (background refetch)', () => {
    render(<ScreenState loading ready>{child}</ScreenState>)
    expect(screen.getByText('content')).toBeTruthy()
    expect(screen.queryByTestId('screen-state-loading')).toBeNull()
  })

  it('shows the error with a working Retry button', () => {
    const onRetry = jest.fn()
    render(<ScreenState error="Could not load events" onRetry={onRetry}>{child}</ScreenState>)
    expect(screen.getByText('Could not load events')).toBeTruthy()
    fireEvent.press(screen.getByText('Retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('content')).toBeNull()
  })

  it('uses a generic message for a boolean error and hides Retry without a handler', () => {
    render(<ScreenState error>{child}</ScreenState>)
    expect(screen.getByText(/Something went wrong/)).toBeTruthy()
    expect(screen.queryByText('Retry')).toBeNull()
  })

  it('prefers the error over empty', () => {
    render(<ScreenState error="boom" empty emptyTitle="Nothing">{child}</ScreenState>)
    expect(screen.getByText('boom')).toBeTruthy()
    expect(screen.queryByText('Nothing')).toBeNull()
  })

  it('shows the empty state with its copy and action', () => {
    const onAction = jest.fn()
    render(
      <ScreenState empty emptyTitle="No events" emptyBody="Try another filter" emptyActionLabel="Clear filter" onEmptyAction={onAction}>
        {child}
      </ScreenState>,
    )
    expect(screen.getByText('No events')).toBeTruthy()
    expect(screen.getByText('Try another filter')).toBeTruthy()
    fireEvent.press(screen.getByText('Clear filter'))
    expect(onAction).toHaveBeenCalled()
    expect(screen.queryByText('content')).toBeNull()
  })

  it('renders children otherwise', () => {
    render(<ScreenState>{child}</ScreenState>)
    expect(screen.getByText('content')).toBeTruthy()
  })
})

describe('EmptyState', () => {
  it('renders title only, without a body or action', () => {
    render(<EmptyState title="No upcoming events yet" />)
    expect(screen.getByText('No upcoming events yet')).toBeTruthy()
  })
})

describe('Chip', () => {
  it('styles active vs inactive and reports selection state', () => {
    const { rerender } = render(<Chip label="All" onPress={() => {}} testID="chip" />)
    expect(flat(screen.getByTestId('chip')).backgroundColor).toBe(theme.colors.card)
    expect(screen.getByTestId('chip').props.accessibilityState).toEqual({ selected: false })

    rerender(<Chip label="All" active onPress={() => {}} testID="chip" />)
    expect(flat(screen.getByTestId('chip')).backgroundColor).toBe(theme.colors.primary)
    expect(flat(screen.getByText('All')).color).toBe(theme.colors.onPrimary)
    expect(screen.getByTestId('chip').props.accessibilityState).toEqual({ selected: true })
  })

  it('tint variant uses a translucent primary wash with primary text', () => {
    render(<Chip label="Joined" active variant="tint" onPress={() => {}} testID="chip" />)
    expect(flat(screen.getByTestId('chip')).backgroundColor).toBe(theme.colors.primary + '24')
    expect(flat(screen.getByText('Joined')).color).toBe(theme.colors.primary)
  })

  it('appends the badge to the label and fires onPress', () => {
    const onPress = jest.fn()
    render(<Chip label="Mine" badge={3} onPress={onPress} testID="chip" />)
    fireEvent.press(screen.getByTestId('chip'))
    expect(screen.getByText('Mine 3')).toBeTruthy()
    expect(onPress).toHaveBeenCalled()
  })

  it('shows a badge of 0 (only undefined/empty hide it)', () => {
    render(<Chip label="Mine" badge={0} onPress={() => {}} />)
    expect(screen.getByText('Mine 0')).toBeTruthy()
  })
})

describe('IconButton', () => {
  it('is labelled, sized and pressable', () => {
    const onPress = jest.fn()
    render(<IconButton icon="notifications-outline" label="Notifications" onPress={onPress} testID="bell" />)
    const btn = screen.getByLabelText('Notifications')
    expect(flat(btn)).toMatchObject({ width: 38, height: 38, borderRadius: theme.radius.md })
    fireEvent.press(btn)
    expect(onPress).toHaveBeenCalled()
  })

  it('supports the 44pt size and the unread dot', () => {
    render(<IconButton icon="notifications" label="Bell" size={44} badge active onPress={() => {}} testID="bell" />)
    expect(flat(screen.getByTestId('bell'))).toMatchObject({ width: 44, height: 44 })
    expect(screen.getByTestId('bell-badge')).toBeTruthy()
  })

  it('omits the dot by default', () => {
    render(<IconButton icon="notifications" label="Bell" onPress={() => {}} testID="bell" />)
    expect(screen.queryByTestId('bell-badge')).toBeNull()
  })
})

describe('ScreenHeader', () => {
  it('renders kicker, title with the accent dot and the right slot', () => {
    render(<ScreenHeader kicker="October 2026" title="Events" titleDot right={<Text>R</Text>} />)
    expect(screen.getByText('October 2026')).toBeTruthy()
    expect(screen.getByText('R')).toBeTruthy()
    expect(screen.getByText('.')).toBeTruthy()
    expect(screen.getByRole('header')).toBeTruthy()
  })

  it('shows a back row only when onBack is given', () => {
    const onBack = jest.fn()
    const { rerender } = render(<ScreenHeader title="Club" />)
    expect(screen.queryByTestId('screen-header-back')).toBeNull()
    rerender(<ScreenHeader title="Club" onBack={onBack} backLabel="Clubs" />)
    fireEvent.press(screen.getByTestId('screen-header-back'))
    expect(screen.getByText('Clubs')).toBeTruthy()
    expect(onBack).toHaveBeenCalled()
  })
})

describe('ConfirmDialog', () => {
  const base = { visible: true, title: 'Delete event', body: 'Cannot be undone.', confirmLabel: 'Delete' }

  it('renders copy and routes confirm / cancel', () => {
    const onConfirm = jest.fn()
    const onCancel = jest.fn()
    render(<ConfirmDialog {...base} onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByText('Delete event')).toBeTruthy()
    expect(screen.getByText('Cannot be undone.')).toBeTruthy()
    fireEvent.press(screen.getByText('Delete'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.press(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('uses a custom cancel label and cancels from the backdrop', () => {
    const onCancel = jest.fn()
    render(<ConfirmDialog {...base} cancelLabel="Keep" onConfirm={() => {}} onCancel={onCancel} />)
    expect(screen.getByText('Keep')).toBeTruthy()
    fireEvent.press(screen.getByTestId('confirm-dialog-backdrop'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('destructive uses the danger fill, otherwise primary', () => {
    const { rerender } = render(<ConfirmDialog {...base} destructive onConfirm={() => {}} onCancel={() => {}} />)
    expect(flat(screen.getByTestId('confirm-dialog-confirm')).backgroundColor).toBe(theme.colors.error)
    rerender(<ConfirmDialog {...base} onConfirm={() => {}} onCancel={() => {}} />)
    expect(flat(screen.getByTestId('confirm-dialog-confirm')).backgroundColor).toBe(theme.colors.primary)
  })

  it('is inert while loading: backdrop and buttons do nothing', () => {
    const onConfirm = jest.fn()
    const onCancel = jest.fn()
    render(<ConfirmDialog {...base} loading onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.press(screen.getByTestId('confirm-dialog-backdrop'))
    fireEvent.press(screen.getByTestId('confirm-dialog-cancel'))
    fireEvent.press(screen.getByTestId('confirm-dialog-confirm'))
    expect(onCancel).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('renders nothing when not visible', () => {
    render(<ConfirmDialog {...base} visible={false} onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.queryByText('Delete event')).toBeNull()
  })
})

describe('BottomSheet', () => {
  it('renders title and children, adds the safe-area inset, and dismisses from the backdrop', () => {
    const onDismiss = jest.fn()
    render(
      <BottomSheet visible title="Add Prize" onDismiss={onDismiss}>
        <Text>form</Text>
      </BottomSheet>,
    )
    expect(screen.getByText('Add Prize')).toBeTruthy()
    expect(screen.getByText('form')).toBeTruthy()
    expect(flat(screen.getByTestId('bottom-sheet')).paddingBottom).toBe(34 + theme.spacing.lg)
    fireEvent.press(screen.getByTestId('bottom-sheet-backdrop'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('hides when not visible', () => {
    render(<BottomSheet visible={false} onDismiss={() => {}}><Text>form</Text></BottomSheet>)
    expect(screen.queryByText('form')).toBeNull()
  })
})

describe('ScreenContainer', () => {
  it('renders children (native: plain flex View)', () => {
    render(<ScreenContainer padded><Text>body</Text></ScreenContainer>)
    expect(screen.getByText('body')).toBeTruthy()
  })
})

describe('Button', () => {
  it('keeps the original look by default (md, full width, primary)', () => {
    render(<Button label="Save" onPress={() => {}} testID="btn" />)
    const style = flat(screen.getByTestId('btn'))
    expect(style.backgroundColor).toBe(theme.colors.primary)
    expect(style.padding).toBe(theme.spacing.md)
    expect(style.alignSelf).toBeUndefined()
  })

  it.each([
    ['primary', theme.colors.primary],
    ['danger', theme.colors.error],
    ['secondary', 'transparent'],
    ['ghost', 'transparent'],
  ] as const)('%s variant background', (variant, bg) => {
    render(<Button label="Go" variant={variant} onPress={() => {}} testID="btn" />)
    expect(flat(screen.getByTestId('btn')).backgroundColor).toBe(bg)
  })

  it('secondary has a primary border, ghost has none; both use a primary label', () => {
    const { rerender } = render(<Button label="Go" variant="secondary" onPress={() => {}} testID="btn" />)
    expect(flat(screen.getByTestId('btn')).borderColor).toBe(theme.colors.primary)
    expect(flat(screen.getByText('Go')).color).toBe(theme.colors.primary)
    rerender(<Button label="Go" variant="ghost" onPress={() => {}} testID="btn" />)
    expect(flat(screen.getByTestId('btn')).borderWidth).toBeUndefined()
    expect(flat(screen.getByText('Go')).color).toBe(theme.colors.primary)
  })

  it('sm size and fullWidth=false apply', () => {
    render(<Button label="Go" size="sm" fullWidth={false} onPress={() => {}} testID="btn" />)
    const style = flat(screen.getByTestId('btn'))
    expect(style.minHeight).toBe(36)
    expect(style.alignSelf).toBe('flex-start')
  })

  it('merges a style override and passes the accessibility label', () => {
    render(<Button label="Go" style={{ marginTop: 7 }} accessibilityLabel="Go now" onPress={() => {}} testID="btn" />)
    expect(flat(screen.getByTestId('btn')).marginTop).toBe(7)
    expect(screen.getByLabelText('Go now')).toBeTruthy()
  })

  it('presses, and blocks presses when disabled or loading', () => {
    const onPress = jest.fn()
    const { rerender } = render(<Button label="Go" onPress={onPress} />)
    fireEvent.press(screen.getByText('Go'))
    expect(onPress).toHaveBeenCalledTimes(1)

    rerender(<Button label="Go" onPress={onPress} disabled />)
    fireEvent.press(screen.getByText('Go'))
    rerender(<Button label="Go" onPress={onPress} loading testID="btn" />)
    fireEvent.press(screen.getByTestId('btn'))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Go')).toBeNull()
  })

  it('renders a leading icon', () => {
    render(<Button label="Share" icon="share-outline" onPress={() => {}} testID="btn" />)
    expect(flat(screen.getByTestId('btn')).flexDirection).toBe('row')
    expect(screen.getByText('Share')).toBeTruthy()
  })
})

describe('Input additions', () => {
  it('passes accessibilityLabel and renders the right adornment', () => {
    render(
      <Input value="" onChangeText={() => {}} accessibilityLabel="Search" right={<Text>clear</Text>} />,
    )
    expect(screen.getByLabelText('Search')).toBeTruthy()
    expect(screen.getByText('clear')).toBeTruthy()
  })

  it('renders exactly as before without the new props', () => {
    render(<Input value="x" onChangeText={() => {}} label="Name" />)
    expect(screen.getByText('Name')).toBeTruthy()
    expect(flat(screen.getByDisplayValue('x')).paddingRight).toBeUndefined()
  })
})
