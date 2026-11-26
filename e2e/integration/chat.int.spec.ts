/**
 * Chat on the server, in the e2e account's seed DM with e2ebuddy: send, react,
 * edit, delete (soft), read marks and the conversation list, silencing, and
 * opening a DM finds the existing one. Messages are soft-deleted at the end, so
 * the seed DM keeps no visible test text.
 */
import { test, expect } from '@playwright/test'
import { BUDDY_ID, RUN, SEED_DM_ID, ok, refused, signIn, type Me } from './helpers'

test.describe.configure({ mode: 'serial' })

let me: Me
let messageId = ''

test.beforeAll(async () => { me = await signIn() })
test.afterAll(async () => {
  if (me) {
    // Soft-delete anything this run sent, and make sure buddy isn't left silenced.
    await me.db.from('messages').update({ deleted_at: new Date().toISOString() }).eq('conversation_id', SEED_DM_ID).eq('sender_id', me.id).like('content', `${RUN}%`).is('deleted_at', null)
    await me.db.from('chat_silences').delete().eq('user_id', me.id).eq('silenced_user_id', BUDDY_ID)
  }
  await me?.db.auth.signOut({ scope: 'local' })
})

test('opening a DM with buddy finds the seed conversation', async () => {
  const id = await ok('find_or_create_dm', () => me.db.rpc('find_or_create_dm', { other_user_id: BUDDY_ID }))
  expect(id).toBe(SEED_DM_ID)
})

test('send a message, and it leads the conversation list', async () => {
  const msg = await ok('send', () => me.db.from('messages').insert({ conversation_id: SEED_DM_ID, sender_id: me.id, content: `${RUN} hello` }).select('id').single()) as { id: string }
  messageId = msg.id
  const list = await ok('get_my_conversations', () => me.db.rpc('get_my_conversations')) as { conversation_id: string; last_message_id: string }[]
  expect(list.find(c => c.conversation_id === SEED_DM_ID)?.last_message_id).toBe(messageId)
})

test("can't send as someone else", async () => {
  await refused('send as buddy', () => me.db.from('messages').insert({ conversation_id: SEED_DM_ID, sender_id: BUDDY_ID, content: `${RUN} forged` }))
})

test('react, then take the reaction back', async () => {
  test.skip(!messageId)
  await ok('react', () => me.db.from('message_reactions').insert({ message_id: messageId, user_id: me.id, emoji: '🏐' }))
  const rx = await ok('read reactions', () => me.db.from('message_reactions').select('emoji').eq('message_id', messageId))
  expect((rx as { emoji: string }[]).map(r => r.emoji)).toContain('🏐')
  await ok('unreact', () => me.db.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', me.id).eq('emoji', '🏐'))
})

test('mark the conversation read', async () => {
  await ok('mark_conversation_read', () => me.db.rpc('mark_conversation_read', { p_conversation_id: SEED_DM_ID }))
  const row = await ok('my membership', () => me.db.from('conversation_members').select('last_read_at').eq('conversation_id', SEED_DM_ID).eq('user_id', me.id).single()) as { last_read_at: string | null }
  expect(row.last_read_at).not.toBeNull()
  expect(Date.now() - new Date(row.last_read_at!).getTime()).toBeLessThan(5 * 60_000)
})

test('silence buddy, then lift it', async () => {
  await ok('silence', () => me.db.from('chat_silences').insert({ user_id: me.id, silenced_user_id: BUDDY_ID }))
  const on = await ok('read silences', () => me.db.from('chat_silences').select('silenced_user_id').eq('user_id', me.id))
  expect((on as { silenced_user_id: string }[]).map(r => r.silenced_user_id)).toContain(BUDDY_ID)
  await ok('unsilence', () => me.db.from('chat_silences').delete().eq('user_id', me.id).eq('silenced_user_id', BUDDY_ID))
})

test('delete (soft): the message stays with deleted_at set', async () => {
  test.skip(!messageId)
  await ok('delete', () => me.db.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', messageId))
  const row = await ok('read back', () => me.db.from('messages').select('deleted_at').eq('id', messageId).single()) as { deleted_at: string | null }
  expect(row.deleted_at).not.toBeNull()
})
