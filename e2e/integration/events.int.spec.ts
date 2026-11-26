/**
 * Events end to end on the server: host a game (save_event), find it in the feed
 * (get_feed_span) and search (search_feed), join and leave, the card previews,
 * comments, edit, cancel. Each step is the call the app makes. (The bring list has
 * its own spec, e2e/bringList.spec.ts.)
 */
import { test, expect } from '@playwright/test'
import { BUDDY_ID, RUN, daysFromNow, ok, refused, signIn, sweep, type Me } from './helpers'

test.describe.configure({ mode: 'serial' })

let me: Me
let eventId = ''
const TITLE = `${RUN} Pickup`

test.beforeAll(async () => {
  me = await signIn()
  await sweep(me, 'events', 'title', 'created_by')
})
test.afterAll(async () => {
  if (me) await sweep(me, 'events', 'title', 'created_by', false)
  await me?.db.auth.signOut({ scope: 'local' })
})

test('host a game: save_event writes the event and its tags in one call', async () => {
  const tags = await ok('tags', () => me.db.from('tags').select('id, name').eq('name', 'Open Play'))
  const ids = await ok('save_event', () => me.db.rpc('save_event', {
    p_edit_id: null,
    p_event: { title: TITLE, description: 'Integration test game.', location: 'Integration Gym', duration_minutes: 120, max_attendees: 12, price: 5, requires_approval: false, surface: 'indoor', club_id: null },
    p_dates: [daysFromNow(4)],
    p_tag_ids: (tags as { id: string }[]).map(t => t.id),
  } as never))
  expect(Array.isArray(ids) && ids.length).toBe(1)
  eventId = (ids as string[])[0]
  const row = await ok('read back', () => me.db.from('events').select('title, created_by, price, event_tags(tag_id)').eq('id', eventId).single())
  expect(row).toMatchObject({ title: TITLE, created_by: me.id, price: 5 })
  expect((row as { event_tags: unknown[] }).event_tags).toHaveLength(1)
})

test('it is in the feed span and in search', async () => {
  test.skip(!eventId)
  const span = await ok('get_feed_span', () => me.db.rpc('get_feed_span', { p_start: daysFromNow(3, 0), p_end: daysFromNow(6, 0) } as never)) as { events?: { id: string }[] }
  expect(span.events?.some(e => e.id === eventId), 'feed span lists the game').toBe(true)
  const found = await ok('search_feed', () => me.db.rpc('search_feed', { q: 'Integration Gym' } as never)) as { events?: string[] }
  expect(found.events ?? []).toContain(eventId)
})

test('join: the attendee row, the going count and the card previews', async () => {
  test.skip(!eventId)
  const row = await ok('join', () => me.db.from('event_attendees').insert({ event_id: eventId, user_id: me.id }).select('status').single())
  expect((row as { status: string }).status).toBe('attending')
  const going = await ok('going count', () => me.db.from('event_attendees_attending').select('user_id').eq('event_id', eventId))
  expect((going as { user_id: string }[]).map(r => r.user_id)).toContain(me.id)
  const previews = await ok('previews', () => me.db.rpc('get_event_card_attendee_previews', { p_event_ids: [eventId] } as never))
  expect((previews as { user_id: string }[]).some(p => p.user_id === me.id)).toBe(true)
})

test("can't RSVP someone else", async () => {
  test.skip(!eventId)
  await refused('RSVP as buddy', () => me.db.from('event_attendees').insert({ event_id: eventId, user_id: BUDDY_ID }))
})

test('comments: post, read back, delete', async () => {
  test.skip(!eventId)
  const c = await ok('comment', () => me.db.from('event_comments').insert({ event_id: eventId, user_id: me.id, body: `${RUN} see you there` }).select('id').single()) as { id: string }
  const list = await ok('read comments', () => me.db.from('event_comments').select('id, body').eq('event_id', eventId))
  expect((list as { id: string }[]).map(r => r.id)).toContain(c.id)
  await ok('delete comment', () => me.db.from('event_comments').delete().eq('id', c.id))
})

test('edit: save_event with the id changes the row and keeps the tags', async () => {
  test.skip(!eventId)
  const tags = await ok('tags', () => me.db.from('event_tags').select('tag_id').eq('event_id', eventId)) as { tag_id: string }[]
  await ok('save_event edit', () => me.db.rpc('save_event', {
    p_edit_id: eventId,
    p_event: { title: `${TITLE} (moved)`, description: 'Integration test game.', location: 'Integration Gym 2', duration_minutes: 90, max_attendees: 12, price: 5, requires_approval: false, surface: 'indoor', club_id: null },
    p_dates: [daysFromNow(5)],
    p_tag_ids: tags.map(t => t.tag_id),
  } as never))
  const row = await ok('read edit', () => me.db.from('events').select('title, location, duration_minutes, event_tags(tag_id)').eq('id', eventId).single()) as { title: string; location: string; duration_minutes: number; event_tags: unknown[] }
  expect(row).toMatchObject({ title: `${TITLE} (moved)`, location: 'Integration Gym 2', duration_minutes: 90 })
  expect(row.event_tags).toHaveLength(tags.length)
})

test('leave, then cancel the game', async () => {
  test.skip(!eventId)
  await ok('leave', () => me.db.from('event_attendees').delete().eq('event_id', eventId).eq('user_id', me.id))
  const going = await ok('after leaving', () => me.db.from('event_attendees_attending').select('user_id').eq('event_id', eventId))
  expect((going as { user_id: string }[]).map(r => r.user_id)).not.toContain(me.id)
  await ok('cancel', () => me.db.from('events').update({ cancelled_at: new Date().toISOString() }).eq('id', eventId))
  const span = await ok('feed after cancel', () => me.db.rpc('get_feed_span', { p_start: daysFromNow(4, 0), p_end: daysFromNow(7, 0) } as never)) as { events?: { id: string; cancelled_at?: string | null }[] }
  const card = span.events?.find(e => e.id === eventId)
  expect(!card || !!card.cancelled_at, 'a cancelled game is gone or marked cancelled').toBe(true)
})
