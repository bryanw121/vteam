import { readFileSync } from 'fs'
import { join } from 'path'
import {
  friendErrorMessage,
  friendsGoingLabel,
  friendStatusOf,
  groupFriendsGoing,
  sortFriends,
  visibleIncoming,
} from '../utils/friends'
import { applyFriendAction, splitRequests } from '../hooks/useFriends'
import { BEST_FRIEND_LIMIT, FRIEND_COPY, FRIEND_REQUESTS_PER_DAY } from '../constants/friends'
import { NOTIFICATION_TYPES } from '../types'

/** Notification types later migrations added (reports, #243). */
const ADDED_AFTER_FRIENDS: readonly string[] = ['bring_item_uncovered', 'report_resolved', 'moderation_warning', 'club_poll']
import { USER_SCOPED_PREFIXES } from '../hooks/useCacheUserScope'
import type { Friend, FriendGoing, FriendRequest, FriendsData, ProfileBrief } from '../types'

const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8')
const migration = read('supabase/migrations/20261028203837_friends.sql')

const ME = 'me'
const brief = (id: string, first: string | null = null): ProfileBrief => ({
  id, username: `u_${id}`, first_name: first, last_name: null, avatar_url: null, selected_border: null,
})
const friend = (id: string, best = false, first: string | null = null): Friend => ({
  friend_id: id, is_best_friend: best, created_at: '2026-10-01T00:00:00Z', profile: brief(id, first),
})
const req = (id: string, from: string, to: string, at = '2026-10-01T00:00:00Z'): FriendRequest => ({
  id, requester_id: from, addressee_id: to, created_at: at, other: brief(from === ME ? to : from),
})
const data: FriendsData = {
  friends: [friend('ana', false, 'Ana')],
  incoming: [req('r1', 'ben', ME)],
  outgoing: [req('r2', ME, 'cat')],
}

describe('friendStatusOf', () => {
  it('derives every state from my lists', () => {
    expect(friendStatusOf(data, 'ana')).toBe('friends')
    expect(friendStatusOf(data, 'ben')).toBe('incoming')
    expect(friendStatusOf(data, 'cat')).toBe('requested')
    expect(friendStatusOf(data, 'dan')).toBe('none')
    expect(friendStatusOf(undefined, 'ana')).toBe('none')
  })
})

describe('sortFriends / visibleIncoming', () => {
  it('puts best friends first, then by name', () => {
    const sorted = sortFriends([friend('z', false, 'Zed'), friend('b', true, 'Bea'), friend('a', false, 'Al')])
    expect(sorted.map(f => f.friend_id)).toEqual(['b', 'a', 'z'])
  })

  it('hides requests from people I silenced, newest first', () => {
    const list = [req('1', 'x', ME, '2026-10-01T00:00:00Z'), req('2', 'y', ME, '2026-10-02T00:00:00Z'), req('3', 'z', ME)]
    expect(visibleIncoming(list, new Set(['z'])).map(r => r.id)).toEqual(['2', '1'])
  })
})

describe('friendsGoingLabel', () => {
  const going = (id: string, first: string | null, best = false): FriendGoing => ({
    event_id: 'e', user_id: id, username: `u_${id}`, first_name: first as string, avatar_url: '', is_best_friend: best,
  })

  it('names one, two, or the first plus a count, best friends first', () => {
    expect(friendsGoingLabel([])).toBe('')
    expect(friendsGoingLabel(undefined)).toBe('')
    expect(friendsGoingLabel([going('a', 'Ana')])).toBe('Ana is going')
    expect(friendsGoingLabel([going('a', 'Ana'), going('b', 'Ben')])).toBe('Ana and Ben are going')
    expect(friendsGoingLabel([going('b', 'Ben'), going('c', 'Cy'), going('a', 'Ana', true)])).toBe('Ana and 2 friends going')
  })

  it('falls back to the username', () => {
    expect(friendsGoingLabel([going('a', null)])).toBe('u_a is going')
  })

  it('groups rows by event', () => {
    const rows = [{ ...going('a', 'Ana'), event_id: 'e1' }, { ...going('b', 'Ben'), event_id: 'e2' }, { ...going('c', 'Cy'), event_id: 'e1' }]
    const map = groupFriendsGoing(rows)
    expect(map.get('e1')?.map(r => r.user_id)).toEqual(['a', 'c'])
    expect(map.get('e2')?.length).toBe(1)
  })
})

describe('splitRequests', () => {
  it('splits pending rows into incoming and outgoing with the other profile', () => {
    const rows = [
      { id: '1', requester_id: 'ben', addressee_id: ME, created_at: 'x', requester: brief('ben'), addressee: brief(ME) },
      { id: '2', requester_id: ME, addressee_id: 'cat', created_at: 'x', requester: brief(ME), addressee: brief('cat') },
    ]
    const { incoming, outgoing } = splitRequests(rows, ME)
    expect(incoming.map(r => r.other?.id)).toEqual(['ben'])
    expect(outgoing.map(r => r.other?.id)).toEqual(['cat'])
  })
})

describe('applyFriendAction (optimistic)', () => {
  it('send adds an outgoing request, or accepts theirs if they already asked', () => {
    expect(applyFriendAction(data, { kind: 'send', userId: 'dan' }, ME).outgoing.map(r => r.addressee_id)).toEqual(['cat', 'dan'])
    const accepted = applyFriendAction(data, { kind: 'send', userId: 'ben' }, ME)
    expect(accepted.incoming).toEqual([])
    expect(accepted.friends.map(f => f.friend_id)).toEqual(['ana', 'ben'])
    expect(applyFriendAction(data, { kind: 'send', userId: 'cat' }, ME)).toBe(data)
  })

  it('respond, cancel, remove and best', () => {
    expect(applyFriendAction(data, { kind: 'respond', requestId: 'r1', accept: false }, ME).friends.length).toBe(1)
    expect(applyFriendAction(data, { kind: 'respond', requestId: 'r1', accept: true }, ME).friends.length).toBe(2)
    expect(applyFriendAction(data, { kind: 'cancel', userId: 'cat' }, ME).outgoing).toEqual([])
    expect(applyFriendAction(data, { kind: 'remove', userId: 'ana' }, ME).friends).toEqual([])
    expect(applyFriendAction(data, { kind: 'best', userId: 'ana', best: true }, ME).friends[0].is_best_friend).toBe(true)
  })
})

describe('friendErrorMessage', () => {
  it('maps the RPC error codes to copy', () => {
    expect(friendErrorMessage({ code: 'PT429', message: 'friend request limit reached' })).toBe(FRIEND_COPY.limitReached)
    expect(friendErrorMessage({ code: '42501', message: 'friend request not allowed' })).toBe(FRIEND_COPY.notAllowed)
    expect(friendErrorMessage({ code: '23514', message: 'best friend limit reached' })).toBe(FRIEND_COPY.bestFriendLimit)
    expect(friendErrorMessage({ code: 'P0002', message: 'friend request not found' })).toBe(FRIEND_COPY.gone)
    expect(friendErrorMessage({ code: 'XX000', message: 'boom' })).toBeNull()
    expect(friendErrorMessage(null)).toBeNull()
  })
})

describe('friends migration', () => {
  it('limits in the app match the SQL', () => {
    expect(migration).toContain(`>= ${FRIEND_REQUESTS_PER_DAY} then`)
    expect(migration).toMatch(new RegExp(`f\\.is_best_friend\\) >= ${BEST_FRIEND_LIMIT} then`))
  })

  it('allows every notification type the app knows, and only those', () => {
    const list = migration.match(/add constraint notifications_notification_type_check[\s\S]*?array\[([\s\S]*?)\]::text\[\]/)?.[1] ?? ''
    const sqlTypes = [...list.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort()
    expect(sqlTypes).toEqual(NOTIFICATION_TYPES.filter(t => !ADDED_AFTER_FRIENDS.includes(t)).sort())
  })

  it('the down restores every other type and drops only the friend ones', () => {
    const down = read('supabase/migrations/20261028203837_friends.down.sql')
    const list = down.match(/add constraint notifications_notification_type_check[\s\S]*?array\[([\s\S]*?)\]::text\[\]/)?.[1] ?? ''
    const sqlTypes = [...list.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort()
    expect(sqlTypes).toEqual(NOTIFICATION_TYPES.filter(t => t !== 'friend_request' && t !== 'friend_accepted' && !ADDED_AFTER_FRIENDS.includes(t)).sort())
  })

  it('every SECURITY DEFINER function pins search_path and no RPC is granted to anon', () => {
    const fns = migration.split(/create or replace function /).slice(1)
    for (const fn of fns) {
      if (/security definer/.test(fn)) expect(fn).toMatch(/set search_path = ''/)
    }
    expect(migration).not.toMatch(/grant [^;]* to [^;]*\banon\b/)
    expect(migration).toMatch(/revoke all on public\.friendships from anon, authenticated/)
  })

  it('has a rollback', () => {
    expect(read('supabase/migrations/20261028203837_friends.down.sql')).toMatch(/drop table if exists public\.friendships/)
  })
})

describe('cache scope', () => {
  it('drops friends data when the signed-in user changes', () => {
    expect(USER_SCOPED_PREFIXES).toContain('friends')
  })
})
