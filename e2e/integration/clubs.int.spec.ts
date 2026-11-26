/**
 * Clubs on the server: create one (the owner row comes from a trigger), post,
 * comment and like, run a poll (create, vote, change the vote), the game-alerts
 * bell, and the club chat that comes with it. The club is deleted afterwards,
 * which cascades to everything else here.
 */
import { test, expect } from '@playwright/test'
import { RUN, ok, refused, signIn, sweep, type Me } from './helpers'

/** This file's rows (see sweep). */
const MINE = `${RUN} clubs`

test.describe.configure({ mode: 'serial' })

let me: Me
let clubId = ''
let postId = ''
let pollId = ''
const NAME = `${MINE} Club`

test.beforeAll(async () => {
  me = await signIn()
  await sweep(me, 'clubs', 'name', 'created_by', MINE)
})
test.afterAll(async () => {
  if (me) await sweep(me, 'clubs', 'name', 'created_by', MINE, false)
  await me?.db.auth.signOut({ scope: 'local' })
})

test('create a club: the creator is its owner', async () => {
  const city = await ok('a city', () => me.db.from('major_cities').select('id').limit(1).single()) as { id: string }
  const club = await ok('create club', () => me.db.from('clubs').insert({
    name: NAME, created_by: me.id, major_city_id: city.id, membership_type: 'open', description: 'Integration test club.',
  }).select('id').single()) as { id: string }
  clubId = club.id
  const member = await ok('owner row', () => me.db.from('club_members').select('role').eq('club_id', clubId).eq('user_id', me.id).single())
  expect((member as { role: string }).role).toBe('owner')
})

test('post, comment and like an update', async () => {
  test.skip(!clubId)
  const post = await ok('post', () => me.db.from('club_posts').insert({ club_id: clubId, created_by: me.id, body: `${MINE} nets up at 4` }).select('id').single()) as { id: string }
  postId = post.id
  await ok('comment', () => me.db.from('club_post_comments').insert({ club_post_id: postId, user_id: me.id, body: 'On my way' }))
  await ok('like', () => me.db.from('club_post_likes').insert({ club_post_id: postId, user_id: me.id }))
  const back = await ok('read post', () => me.db.from('club_posts').select('id, club_post_comments(body), club_post_likes(user_id)').eq('id', postId).single()) as {
    club_post_comments: { body: string }[]; club_post_likes: { user_id: string }[]
  }
  expect(back.club_post_comments.map(c => c.body)).toContain('On my way')
  expect(back.club_post_likes.map(l => l.user_id)).toContain(me.id)
  await ok('unlike', () => me.db.from('club_post_likes').delete().eq('club_post_id', postId).eq('user_id', me.id))
})

test('a poll: the owner posts it, a member votes, a new vote replaces the old one', async () => {
  test.skip(!clubId)
  pollId = await ok('create_club_poll', () => me.db.rpc('create_club_poll', {
    p_club_id: clubId, p_question: `${MINE} Which night?`, p_kind: 'text',
    p_options: [{ label: 'Tuesday' }, { label: 'Thursday' }], p_multi: false, p_notify: false,
  })) as string
  const options = await ok('options', () => me.db.from('club_poll_options').select('id, label').eq('post_id', pollId).order('position')) as { id: string; label: string }[]
  expect(options.map(o => o.label)).toEqual(['Tuesday', 'Thursday'])
  await ok('vote Tuesday', () => me.db.rpc('vote_club_poll', { p_post_id: pollId, p_option_ids: [options[0].id] }))
  await ok('switch to Thursday', () => me.db.rpc('vote_club_poll', { p_post_id: pollId, p_option_ids: [options[1].id] }))
  const votes = await ok('my votes', () => me.db.from('club_poll_votes').select('option_id').eq('post_id', pollId).eq('user_id', me.id)) as { option_id: string }[]
  expect(votes.map(v => v.option_id)).toEqual([options[1].id])
  // A single-choice poll refuses two picks.
  await refused('two picks on a single-choice poll', () => me.db.rpc('vote_club_poll', { p_post_id: pollId, p_option_ids: options.map(o => o.id) }))
})

test('game alerts: the bell turns on and off', async () => {
  test.skip(!clubId)
  await ok('alerts on', () => me.db.rpc('set_club_game_alerts', { p_club_id: clubId, p_on: true }))
  const on = await ok('read on', () => me.db.from('club_members').select('game_alerts').eq('club_id', clubId).eq('user_id', me.id).single())
  expect((on as { game_alerts: boolean }).game_alerts).toBe(true)
  await ok('alerts off', () => me.db.rpc('set_club_game_alerts', { p_club_id: clubId, p_on: false }))
})

test("the club chat exists and the owner can post in it", async () => {
  test.skip(!clubId)
  const conv = await ok('club conversation', () => me.db.from('conversations').select('id').eq('club_id', clubId).maybeSingle()) as { id: string } | null
  test.skip(!conv, 'this club has no chat on beta')
  await ok('message', () => me.db.from('messages').insert({ conversation_id: conv!.id, sender_id: me.id, content: `${MINE} hello club` }))
  const list = await ok('conversations', () => me.db.rpc('get_my_conversations')) as { id?: string; conversation_id?: string }[]
  expect(list.some(c => (c.id ?? c.conversation_id) === conv!.id)).toBe(true)
})
