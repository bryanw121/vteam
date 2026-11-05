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
  expect(StyleSheet.flatten(image.props.style).opacity).toBe(0.25)
  expect(image.props.accessibilityLabel).toBe('Newcomer (locked)')
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
