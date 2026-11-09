import React from 'react'
import { render } from '@testing-library/react-native'
import {
  bearerToken, isRecentSignIn, jwtPayload, lastSignInAt, parseDeleteRequest, REAUTH_MAX_AGE_SECONDS,
} from '../supabase/functions/_shared/accountDeletion'
import { deletionPlanIsEmpty, needsRecentSignIn, REAUTH_MAX_AGE_SECONDS as CLIENT_MAX_AGE } from '../utils/accountDeletion'
import { clubConsequences, DeletionPlanList } from '../components/profile/DeletionPlanList'
import type { AccountDeletionPlan } from '../types'

const bo = { id: 'u2', username: 'bo', first_name: 'Bo', last_name: 'Lee' }
const HASH = 'a'.repeat(32)
const PLAN: AccountDeletionPlan = {
  clubs: [
    { id: 'c1', name: 'Sand Club', action: 'transfer', to: bo, members: 8, posts: 3, tournaments: 1, has_chat: true },
    { id: 'c2', name: 'Solo Club', action: 'delete', to: null, members: 4, posts: 12, tournaments: 2, has_chat: true },
  ],
  tournaments: [
    { id: 't1', title: 'Fall Cup', status: 'completed', action: 'delete', with_club: 'Solo Club', to: null },
    { id: 't2', title: 'Spring Cup', status: 'published', action: 'transfer', with_club: null, to: bo },
  ],
  events: [
    { id: 'e1', title: 'Tuesday Open', event_date: '2026-11-03T19:00:00', action: 'cancel', to: null },
    { id: 'e2', title: 'Thursday Open', event_date: '2026-11-05T19:00:00', action: 'transfer', to: bo },
  ],
  past_events_kept: 3,
  kudos_given_kept: 7,
  hash: HASH,
}

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const token = (payload: object) => `${b64url({ alg: 'HS256' })}.${b64url(payload)}.sig`

describe('delete-account request checks', () => {
  it('requires the typed confirmation and the preview hash', () => {
    expect(parseDeleteRequest({ confirm: 'DELETE', planHash: HASH })).toEqual({ confirm: 'DELETE', planHash: HASH })
    expect(parseDeleteRequest({ confirm: 'delete', planHash: HASH })).toBeNull()
    expect(parseDeleteRequest({ confirm: 'DELETE' })).toBeNull()
    expect(parseDeleteRequest({ confirm: 'DELETE', planHash: 'nope' })).toBeNull()
    expect(parseDeleteRequest(null)).toBeNull()
  })
  it('reads a bearer token', () => {
    expect(bearerToken('Bearer abc.def')).toBe('abc.def')
    expect(bearerToken('Basic xyz')).toBeNull()
    expect(bearerToken(null)).toBeNull()
  })
})

describe('recent sign-in', () => {
  const now = 2_000_000_000
  it('uses the latest amr timestamp, not iat', () => {
    const t = token({ iat: now, amr: [{ method: 'password', timestamp: now - 3600 }, { method: 'otp', timestamp: now - 60 }] })
    expect(lastSignInAt(jwtPayload(t))).toBe(now - 60)
  })
  it('accepts a sign-in within 10 minutes and refuses older or unknown ones', () => {
    expect(isRecentSignIn(now - 60, now)).toBe(true)
    expect(isRecentSignIn(now - REAUTH_MAX_AGE_SECONDS - 1, now)).toBe(false)
    expect(isRecentSignIn(null, now)).toBe(false)
    expect(lastSignInAt(jwtPayload(token({ iat: now })))).toBeNull()
  })
  it('the app asks for a fresh sign-in a little before the server would refuse', () => {
    expect(CLIENT_MAX_AGE).toBe(REAUTH_MAX_AGE_SECONDS)
    expect(needsRecentSignIn(token({ amr: [{ method: 'password', timestamp: now - 30 }] }), now)).toBe(false)
    expect(needsRecentSignIn(token({ amr: [{ method: 'password', timestamp: now - REAUTH_MAX_AGE_SECONDS + 30 }] }), now)).toBe(true)
    expect(needsRecentSignIn(null, now)).toBe(true)
  })
})

describe('DeletionPlanList', () => {
  it('names every club, tournament and event with what happens to it', () => {
    const view = render(<DeletionPlanList plan={PLAN} />)
    for (const name of ['Sand Club', 'Solo Club', 'Fall Cup', 'Spring Cup', 'Tuesday Open', 'Thursday Open']) {
      expect(view.getByText(name)).toBeTruthy()
    }
    expect(view.getAllByText('Goes to Bo Lee (@bo)')).toHaveLength(2)
    expect(view.getByText('Goes to Bo Lee (@bo) (your co-host)')).toBeTruthy()
    expect(view.getByText('Deleted with the club')).toBeTruthy()
    expect(view.getByText('Cancelled, and players who joined are notified')).toBeTruthy()
    expect(view.getByText('3 past events you hosted will stay, without your name.')).toBeTruthy()
    expect(view.getByText(/7 kudos you gave stay with the people who received them/)).toBeTruthy()
  })
  it('spells out what a club deletion takes with it', () => {
    expect(clubConsequences(PLAN.clubs[1])).toBe(
      'Also deletes its group chat, 12 posts, 2 tournaments (including finished ones). 4 members lose the club.')
    const view = render(<DeletionPlanList plan={PLAN} />)
    expect(view.getByText(/Finished: results and standings go too/)).toBeTruthy()
  })
  it('says so when nothing else is affected', () => {
    const empty = { ...PLAN, clubs: [], tournaments: [], events: [], past_events_kept: 0, kudos_given_kept: 0 }
    expect(deletionPlanIsEmpty(empty)).toBe(true)
    const view = render(<DeletionPlanList plan={empty} />)
    expect(view.getByText(/nothing else is deleted or handed over/)).toBeTruthy()
  })
})
