import React from 'react'
import { act, render } from '@testing-library/react-native'
import { SessionProvider, useSession } from '../contexts/session'
import type { SessionState } from '../types'

let mockResolveGetSession: (value: { data: { session: unknown } }) => void = () => {}
let mockStored: unknown = null
jest.mock('../lib/supabase', () => ({
  readStoredSession: () => mockStored,
  supabase: {
    auth: {
      getSession: () => new Promise(r => { mockResolveGetSession = r }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}))

let seen: SessionState | null = null
function Probe() {
  seen = useSession()
  return null
}

beforeEach(() => {
  mockStored = null
  seen = null
})

describe('SessionProvider', () => {
  it('draws for the saved viewer before getSession (and its token refresh) resolves', async () => {
    mockStored = { user: { id: 'u1' }, refresh_token: 'r' }
    render(<SessionProvider><Probe /></SessionProvider>)
    expect(seen).toMatchObject({ userId: 'u1', loading: false, isGuest: false })

    // getSession then decides: here the refresh failed and nobody is signed in.
    await act(async () => { mockResolveGetSession({ data: { session: null } }) })
    expect(seen).toMatchObject({ userId: null, loading: false, isGuest: true })
  })

  it('waits for getSession when nothing is saved', async () => {
    render(<SessionProvider><Probe /></SessionProvider>)
    expect(seen).toMatchObject({ userId: null, loading: true, isGuest: false })
    await act(async () => { mockResolveGetSession({ data: { session: { user: { id: 'u2' } } } }) })
    expect(seen).toMatchObject({ userId: 'u2', loading: false })
  })
})
