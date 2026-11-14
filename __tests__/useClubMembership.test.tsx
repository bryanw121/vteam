import React, { useEffect } from 'react'
import { render, act } from '@testing-library/react-native'
import { __resetQueryCache, getQueryData, queryKey, setQueryData } from '../lib/query'
import { useClubMembership } from '../hooks/club/useClubMembership'
import { clubDetailKey } from '../hooks/useClub'
import type { ClubDetailData, ClubListItem, ClubWithDetails } from '../types'

jest.mock('expo-router', () => ({ useFocusEffect: () => {} }))
jest.mock('../lib/sentry', () => ({ Sentry: { captureException: jest.fn() } }))
jest.mock('../lib/analytics', () => ({ track: jest.fn() }))
jest.mock('../lib/toast', () => ({ toast: { error: jest.fn(), show: jest.fn() } }))
jest.mock('../contexts/session', () => ({ useSession: () => ({ userId: 'u2', isGuest: false }) }))

let mockWrites: string[]
let mockError: { message: string } | null
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (row: { club_id: string; user_id: string }) => { mockWrites.push(`insert ${table} ${row.club_id} ${row.user_id}`); return Promise.resolve({ error: mockError }) },
      delete: () => ({ eq: () => ({ eq: () => { mockWrites.push(`delete ${table}`); return Promise.resolve({ error: mockError }) } }) }),
      select: () => ({ eq: () => ({ maybeSingle: () => new Promise(() => {}) }) }),
    }),
  },
}))

const CLUB = {
  id: 'c1', name: 'Eastside Sand', major_cities: null,
  club_members: [{ club_id: 'c1', user_id: 'owner', role: 'owner', joined_at: 'x', game_alerts: true, profiles: null }],
} as unknown as ClubWithDetails
const ROW = { id: 'c1', name: 'Eastside Sand', club_members: [{ count: 1 }], my_membership: [] } as unknown as ClubListItem
const LIST_KEY = queryKey('clubs', 'u2')

let mutate: ((a: 'join' | 'leave') => Promise<unknown>) | null = null
function Harness({ list }: { list: boolean }) {
  const m = useClubMembership('c1', list ? { listKey: LIST_KEY, listClub: ROW } : {})
  useEffect(() => { mutate = m.mutate })
  return null
}

beforeEach(() => {
  __resetQueryCache()
  mockWrites = []
  mockError = null
  setQueryData<ClubDetailData>(clubDetailKey('c1', 'u2'), { club: CLUB, upcomingEvents: [], pastCount: 0 })
  setQueryData<ClubListItem[]>(LIST_KEY, [ROW])
})

describe('useClubMembership (#305)', () => {
  it('joins once and shows it on the page and the list row at once', async () => {
    render(<Harness list />)
    let p: Promise<unknown> = Promise.resolve()
    act(() => { p = mutate!('join') })
    expect(getQueryData<ClubDetailData>(clubDetailKey('c1', 'u2'))?.club?.club_members.map(m => m.user_id)).toEqual(['owner', 'u2'])
    expect(getQueryData<ClubListItem[]>(LIST_KEY)?.[0].club_members).toEqual([{ count: 2 }])
    await act(async () => { await p })
    expect(mockWrites).toEqual(['insert club_members c1 u2'])
  })

  it('rolls both back when the write fails', async () => {
    mockError = { message: 'nope' }
    render(<Harness list />)
    await act(async () => { await mutate!('join') })
    expect(getQueryData<ClubDetailData>(clubDetailKey('c1', 'u2'))?.club?.club_members.map(m => m.user_id)).toEqual(['owner'])
    expect(getQueryData<ClubListItem[]>(LIST_KEY)?.[0].club_members).toEqual([{ count: 1 }])
  })

  it('leaves from the club page without a list row', async () => {
    render(<Harness list={false} />)
    await act(async () => { await mutate!('leave') })
    expect(mockWrites).toEqual(['delete club_members'])
  })
})
