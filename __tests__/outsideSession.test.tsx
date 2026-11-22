/**
 * The outside session sheet (#348): pure rules, the link codec, and the card's note and tap.
 */
import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { alsoOn, directionsQuery, listedLine, signupButtonLabel } from '../utils/outsideSession'
import { rowId } from '../utils/urlState'
import { VIEW } from '../utils/urlViews'
import { routes } from '../utils/routes'
import { ExternalSessionCard } from '../components/ExternalSessionCard'
import type { ExternalSession } from '../types'

jest.mock('../lib/openExternalUrl', () => ({ openExternalUrl: jest.fn(async () => true) }))

const base: ExternalSession = {
  id: 'riverbend-2026-11-29-1800',
  source_id: 'riverbend',
  title: 'Riverbend Open Gym',
  venue: 'Riverbend Rec Center',
  city: 'Austin',
  surface: 'indoor',
  session_type: 'Open play',
  level: 'All levels',
  price: '$8',
  starts_at: '2026-11-30T00:00:00.000Z',
  ends_at: '2026-11-30T03:00:00.000Z',
  signup_url: 'https://www.reclub.co/m/riverbend',
  signup_label: null,
  note: 'Self-called, no referees.',
  verified_at: '2026-11-20T10:00:00.000Z',
  region: 'austin',
}
const at = (id: string, startsAt: string, over: Partial<ExternalSession> = {}): ExternalSession => ({ ...base, id, starts_at: startsAt, ends_at: null, ...over })

describe('alsoOn', () => {
  it('lists later dates of the same session only, soonest first, at most four', () => {
    const later = ['2026-12-14', '2026-12-07', '2026-12-21', '2026-12-28', '2027-01-04'].map((d, i) => at(`r${i}`, `${d}T00:00:00.000Z`))
    const others = [
      at('earlier', '2026-11-23T00:00:00.000Z'),
      at('other-venue', '2026-12-01T00:00:00.000Z', { venue: 'Lantern Hall' }),
      at('other-title', '2026-12-01T00:00:00.000Z', { title: 'Clinic' }),
      at('other-source', '2026-12-01T00:00:00.000Z', { source_id: 'sweatpals' }),
      at('same-time-twice', '2026-12-07T00:00:00.000Z'),
    ]
    expect(alsoOn(base, [base, ...later, ...others]).map(s => s.starts_at.slice(0, 10)))
      .toEqual(['2026-12-07', '2026-12-14', '2026-12-21', '2026-12-28'])
  })

  it('matches title and venue whatever their case and spaces', () => {
    expect(alsoOn(base, [at('x', '2026-12-07T00:00:00.000Z', { title: ' riverbend open GYM', venue: 'RIVERBEND REC CENTER ' })])).toHaveLength(1)
  })
})

describe('sheet lines', () => {
  it('directions search for the venue and city', () => {
    expect(directionsQuery(base)).toBe('Riverbend Rec Center, Austin')
    expect(directionsQuery({ venue: 'Lantern Hall', city: null })).toBe('Lantern Hall')
  })

  it("the sign-up button uses the venue's wording, else the site", () => {
    expect(signupButtonLabel({ ...base, signup_label: 'Drop in · $8 at the door' })).toBe('Drop in · $8 at the door')
    expect(signupButtonLabel(base)).toBe('Sign up on reclub.co')
    expect(signupButtonLabel({ ...base, signup_url: null })).toBeNull()
  })

  it('says where it is listed and when it was checked', () => {
    expect(listedLine(base, '2026-11-20')).toBe('Listed on reclub.co · checked today')
    expect(listedLine(base, '2026-11-21')).toBe('Listed on reclub.co · checked yesterday')
    expect(listedLine(base, '2026-11-22')).toBe('Listed on reclub.co · checked 2 days ago')
    expect(listedLine({ ...base, verified_at: null, signup_url: null }, '2026-11-23')).toBe('Listed by the venue')
    // Stale: the warning has its own row, so only where.
    expect(listedLine(base, '2026-11-25')).toBe('Listed on reclub.co')
  })
})

describe('?session= links', () => {
  it('keeps uuids and Skelly slug ids, drops anything else', () => {
    expect(rowId.parse('volleyworld-2026-10-25-19:30-pflugerville')).toBe('volleyworld-2026-10-25-19:30-pflugerville')
    expect(rowId.parse('8f3c0000-0000-4000-8000-000000000001')).toBe('8f3c0000-0000-4000-8000-000000000001')
    expect(rowId.parse('<script>')).toBe('')
    expect(rowId.parse('a b')).toBe('')
    expect(rowId.parse('x'.repeat(121))).toBe('')
    expect(rowId.parse(undefined)).toBe('')
    expect(rowId.format('')).toBeUndefined()
  })

  it('is part of the Events view and its links', () => {
    expect(VIEW.feed.session).toBe(rowId)
    expect(routes.events({ session: base.id })).toBe(`/?session=${base.id}`)
  })
})

describe('ExternalSessionCard with onOpen', () => {
  it("shows the venue's note and opens the sheet instead of the venue's page", () => {
    const onOpen = jest.fn()
    const screen = render(<ExternalSessionCard session={base} onOpen={onOpen} />)
    expect(screen.getByTestId('external-session-note').props.children).toBe('Self-called, no referees.')
    expect(screen.getByText('Details & sign-up')).toBeTruthy()
    fireEvent.press(screen.getByTestId('external-session-card'))
    expect(onOpen).toHaveBeenCalledWith(base)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect((require('../lib/openExternalUrl') as { openExternalUrl: jest.Mock }).openExternalUrl).not.toHaveBeenCalled()
  })

  it('without onOpen it is the old link card (no note line)', () => {
    const screen = render(<ExternalSessionCard session={base} />)
    expect(screen.queryByTestId('external-session-note')).toBeNull()
    expect(screen.getByText('Sign up on reclub.co')).toBeTruthy()
  })
})
