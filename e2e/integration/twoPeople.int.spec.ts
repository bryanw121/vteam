/**
 * The flows that need two signed-in people: the e2e account ("host") and e2efriend
 * ("friend", e2e/integration/friend.ts). Skipped until e2efriend exists on beta.
 *  - waitlist: a full game waitlists the friend, and moves them up when a spot opens
 *  - approval: the friend asks to join an approval-only game, the host approves
 *  - tournaments: the friend accepts the captain's invite; a join request is approved
 *  - chat: a message from the friend is unread for the host until read
 *  - friends (Mon, Wed, Fri only: 3 requests a week per pair is the rule): request,
 *    accept, then unfriend
 */
import { test, expect } from '@playwright/test'
import { RUN, daysFromNow, ok, refused, signIn, sweep, type Me } from './helpers'
import { signInFriend } from './friend'

test.describe.configure({ mode: 'serial' })

let host: Me
let friend: Me | null = null
let clubId = ''

test.beforeAll(async () => {
  host = await signIn()
  friend = await signInFriend()
  await sweep(host, 'events', 'title', 'created_by')
  await sweep(host, 'clubs', 'name', 'created_by')
})
test.afterAll(async () => {
  if (host) {
    await sweep(host, 'events', 'title', 'created_by', false)
    await sweep(host, 'clubs', 'name', 'created_by', false)
  }
  await host?.db.auth.signOut({ scope: 'local' })
  await friend?.db.auth.signOut({ scope: 'local' })
})

async function hostGame(title: string, extra: Record<string, unknown>): Promise<string> {
  const ids = await ok('save_event', () => host.db.rpc('save_event', {
    p_edit_id: null,
    p_event: { title, description: 'Integration two-person game.', location: 'Integration Gym', duration_minutes: 120, max_attendees: 2, price: 0, requires_approval: false, surface: 'indoor', club_id: null, ...extra },
    p_dates: [daysFromNow(6)],
    p_tag_ids: [],
  } as never)) as string[]
  return ids[0]
}

const statusOf = async (me: Me, eventId: string) =>
  (await ok('my row', () => me.db.from('event_attendees').select('status').eq('event_id', eventId).eq('user_id', me.id).maybeSingle()) as { status: string } | null)?.status ?? null

test('waitlist: a full game waitlists the friend, and a freed spot moves them up with a notification', async () => {
  test.skip(!friend, 'e2efriend does not exist on beta yet')
  const id = await hostGame(`${RUN} Full game`, { max_attendees: 1 })
  await ok('host joins', () => host.db.from('event_attendees').insert({ event_id: id, user_id: host.id }))
  await ok('friend joins', () => friend!.db.from('event_attendees').insert({ event_id: id, user_id: friend!.id }))
  expect(await statusOf(friend!, id)).toBe('waitlisted')
  await ok('host leaves', () => host.db.from('event_attendees').delete().eq('event_id', id).eq('user_id', host.id))
  expect(await statusOf(friend!, id)).toBe('attending')
  const note = await ok('promotion notification', () => friend!.db.from('notifications').select('notification_type, data').eq('user_id', friend!.id).eq('notification_type', 'waitlist_promoted').order('created_at', { ascending: false }).limit(1)) as { data: { event_id?: string } }[]
  expect(note[0]?.data?.event_id).toBe(id)
})

test('approval: the friend asks to join, only the host can approve, and then they are in', async () => {
  test.skip(!friend, 'e2efriend does not exist on beta yet')
  const id = await hostGame(`${RUN} Approval game`, { requires_approval: true, max_attendees: 6 })
  await ok('friend requests', () => friend!.db.from('event_attendees').insert({ event_id: id, user_id: friend!.id, status: 'requested' }))
  expect(await statusOf(friend!, id)).toBe('requested')
  // The friend can't approve themselves.
  await friend!.db.from('event_attendees').update({ status: 'attending' }).eq('event_id', id).eq('user_id', friend!.id)
  expect(await statusOf(friend!, id)).toBe('requested')
  await ok('host approves', () => host.db.from('event_attendees').update({ status: 'attending' }).eq('event_id', id).eq('user_id', friend!.id))
  expect(await statusOf(friend!, id)).toBe('attending')
})

test('tournaments: the friend accepts the captain invite, and a join request is approved onto a team', async () => {
  test.skip(!friend, 'e2efriend does not exist on beta yet')
  const city = await ok('a city', () => host.db.from('major_cities').select('id').limit(1).single()) as { id: string }
  clubId = (await ok('club', () => host.db.from('clubs').insert({ name: `${RUN} Two-person Club`, created_by: host.id, major_city_id: city.id, membership_type: 'open' }).select('id').single()) as { id: string }).id
  // On main a tournament is visible to its club's members, so the friend joins the club.
  await ok('friend joins club', () => friend!.db.from('club_members').insert({ club_id: clubId, user_id: friend!.id, role: 'member' }))
  const tid = await ok('save_tournament', () => host.db.rpc('save_tournament', {
    p_tournament: { title: `${RUN} Two-person Cup`, club_id: clubId, start_date: daysFromNow(12, 15), status: 'published', format: 'pool_play', min_roster_size: 1, max_roster_size: 6 },
    p_rules: {},
  } as never)) as string
  const team = await ok('host team', () => host.db.from('tournament_teams').insert({ tournament_id: tid, name: `${RUN} Hosts`, captain_user_id: host.id, status: 'registered', is_approved: true }).select('id').single()) as { id: string }
  await ok('host on roster', () => host.db.from('tournament_team_members').insert({ team_id: team.id, user_id: host.id, is_captain: true }))

  const inv = await ok('invite friend', () => host.db.from('tournament_team_invitations').insert({ tournament_id: tid, team_id: team.id, inviter_id: host.id, invitee_id: friend!.id }).select('id').single()) as { id: string }
  await ok('friend accepts', () => friend!.db.rpc('accept_tournament_invite', { p_invite_id: inv.id }))
  const roster = await ok('roster', () => host.db.from('tournament_team_members').select('user_id').eq('team_id', team.id)) as { user_id: string }[]
  expect(roster.map(r => r.user_id).sort()).toEqual([host.id, friend!.id].sort())

  // A second team; the friend leaves the first and asks to join it, the organizer approves.
  const other = await ok('second team', () => host.db.from('tournament_teams').insert({ tournament_id: tid, name: `${RUN} Others`, status: 'registered', is_approved: true }).select('id').single()) as { id: string }
  await ok('friend leaves team', () => friend!.db.from('tournament_team_members').delete().eq('team_id', team.id).eq('user_id', friend!.id))
  const req = await ok('join request', () => friend!.db.from('tournament_team_join_requests').insert({ tournament_id: tid, team_id: other.id, requester_id: friend!.id }).select('id').single()) as { id: string }
  await refused('friend approves their own request', () => friend!.db.from('tournament_team_join_requests').update({ status: 'approved' }).eq('id', req.id).select('id').single())
  await ok('organizer adds them', () => host.db.from('tournament_team_members').upsert({ team_id: other.id, user_id: friend!.id, is_captain: false }, { onConflict: 'team_id,user_id', ignoreDuplicates: true }))
  await ok('organizer closes the request', () => host.db.from('tournament_team_join_requests').update({ status: 'approved' }).eq('id', req.id))
  const otherRoster = await ok('second roster', () => host.db.from('tournament_team_members').select('user_id').eq('team_id', other.id)) as { user_id: string }[]
  expect(otherRoster.map(r => r.user_id)).toEqual([friend!.id])
})

test('chat: the friend messages the host, it is unread for the host until read', async () => {
  test.skip(!friend, 'e2efriend does not exist on beta yet')
  const dm = await ok('friend opens a DM', () => friend!.db.rpc('find_or_create_dm', { other_user_id: host.id })) as string
  const msg = await ok('friend sends', () => friend!.db.from('messages').insert({ conversation_id: dm, sender_id: friend!.id, content: `${RUN} you up for Tuesday?` }).select('id').single()) as { id: string }
  const before = await ok('host list', () => host.db.rpc('get_my_conversations')) as { conversation_id: string; last_message_id: string; unread_count?: number }[]
  const row = before.find(c => c.conversation_id === dm)
  expect(row?.last_message_id).toBe(msg.id)
  if (row && 'unread_count' in row) expect(row.unread_count).toBeGreaterThan(0)
  await ok('host reads', () => host.db.rpc('mark_conversation_read', { p_conversation_id: dm }))
  const after = await ok('host list again', () => host.db.rpc('get_my_conversations')) as { conversation_id: string; unread_count?: number }[]
  const again = after.find(c => c.conversation_id === dm)
  if (again && 'unread_count' in again) expect(again.unread_count).toBe(0)
  await ok('friend deletes it', () => friend!.db.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', msg.id))
})

test('friends: request, accept, then unfriend (Mon, Wed and Fri only)', async () => {
  test.skip(!friend, 'e2efriend does not exist on beta yet')
  test.skip(![1, 3, 5].includes(new Date().getUTCDay()), 'friend requests are limited to 3 a week per pair')
  // Start from not-friends.
  await friend!.db.rpc('remove_friend', { p_user_id: host.id })
  await friend!.db.rpc('cancel_friend_request', { p_user_id: host.id })
  const sent = await ok('host asks', () => host.db.rpc('send_friend_request', { p_user_id: friend!.id }))
  expect(sent).toBe('requested')
  const pending = await ok('friend sees it', () => friend!.db.from('friend_requests').select('id').eq('requester_id', host.id).eq('addressee_id', friend!.id).eq('status', 'pending').single()) as { id: string }
  expect(await ok('friend accepts', () => friend!.db.rpc('respond_friend_request', { p_request_id: pending.id, p_accept: true }))).toBe('friends')
  const going = await ok('both rows', () => host.db.from('friendships').select('friend_id').eq('friend_id', friend!.id))
  expect(going).toHaveLength(1)
  expect(await ok('best friend', () => host.db.rpc('set_best_friend', { p_user_id: friend!.id, p_best: true }))).toBe(true)
  expect(await ok('unfriend', () => host.db.rpc('remove_friend', { p_user_id: friend!.id }))).toBe('none')
})
