import React from 'react'
import { StyleSheet } from 'react-native'
import { render } from '@testing-library/react-native'
import { BadgeIcon } from '../components/BadgeIcon'
import { BADGE_DEFINITIONS } from '../constants/badges'

// Distinct ids matter: Jest's PNG transformer otherwise returns the same asset
// stub for every file, masking a renderer that always chooses tier 1.
jest.mock('../constants/badgeArtwork', () => ({
  BADGE_ARTWORK: {
    event_attendee: { 1: 101, 2: 102, 5: 105 },
    beta_tester: { 1: 201 },
  },
}))

const attendee = BADGE_DEFINITIONS.find(d => d.type === 'event_attendee')!

it('renders the earned tier rather than the first-tier image', () => {
  const view = render(<BadgeIcon def={attendee} tier={5} showLabel />)
  expect(view.getByTestId('badge-artwork-event_attendee').props.source).toBe(105)
  expect(view.getByText('Legend')).toBeTruthy()
})

it.each([undefined, 0])('previews first-tier art dimmed when locked (tier %s)', tier => {
  const view = render(<BadgeIcon def={attendee} tier={tier} />)
  const image = view.getByTestId('badge-artwork-event_attendee')
  expect(image.props.source).toBe(101)
  expect(StyleSheet.flatten(view.getByTestId('badge-image-group-event_attendee').props.style).opacity).toBe(0.6)
  expect(view.getByTestId('badge-lock-event_attendee')).toBeTruthy()
  expect(image.props.accessibilityLabel).toBe('Newcomer (locked)')
})

it('keeps full collection labels and makes the collection larger than profile pins', () => {
  const collection = render(<BadgeIcon def={attendee} size="collection" showLabel />)
  expect(StyleSheet.flatten(collection.getByTestId('badge-image-group-event_attendee').props.style).width).toBe(72)
  expect(collection.getByText('Newcomer').props.numberOfLines).toBeUndefined()
  expect(StyleSheet.flatten(collection.getByText('Newcomer').props.style).opacity).toBe(1)
  expect(collection.getByText('Locked · Event Attendance')).toBeTruthy()
  collection.unmount()
  const profile = render(<BadgeIcon def={attendee} tier={1} />)
  expect(StyleSheet.flatten(profile.getByTestId('badge-image-group-event_attendee').props.style).width).toBe(58)
  expect(profile.queryByTestId('badge-lock-event_attendee')).toBeNull()
})

it('shows locked detail artwork at full opacity', () => {
  const view = render(<BadgeIcon def={attendee} size="lg" />)
  expect(StyleSheet.flatten(view.getByTestId('badge-image-group-event_attendee').props.style).opacity).toBe(1)
})

it('renders single-tier artwork', () => {
  const def = BADGE_DEFINITIONS.find(d => d.type === 'beta_tester')!
  const view = render(<BadgeIcon def={def} tier={1} />)
  expect(view.getByTestId('badge-artwork-beta_tester').props.source).toBe(201)
})

it('retains remote per-tier fallback for artwork not yet bundled', () => {
  const def = { ...attendee, tierImageUris: { 3: 'https://example.com/tier3.png' } }
  const view = render(<BadgeIcon def={def} tier={3} />)
  expect(view.getByTestId('badge-artwork-event_attendee').props.source).toEqual({ uri: 'https://example.com/tier3.png' })
})
