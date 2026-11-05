import { timeAgo, lastMessagePreview } from '../utils/chatUtils'
import type { ConversationRow } from '../types'

// ── timeAgo ──────────────────────────────────────────────────────────────────

describe('timeAgo', () => {
  it('returns empty string for null', () => {
    expect(timeAgo(null)).toBe('')
  })

  it('returns "now" for timestamps less than 1 minute ago', () => {
    const iso = new Date(Date.now() - 30_000).toISOString()
    expect(timeAgo(iso)).toBe('now')
  })

  it('returns minutes for timestamps less than 1 hour ago', () => {
    const iso = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(timeAgo(iso)).toBe('5m')
  })

  it('returns hours for timestamps less than 24 hours ago', () => {
    const iso = new Date(Date.now() - 3 * 3600_000).toISOString()
    expect(timeAgo(iso)).toBe('3h')
  })

  it('returns days for timestamps less than 7 days ago', () => {
    const iso = new Date(Date.now() - 2 * 86_400_000).toISOString()
    expect(timeAgo(iso)).toBe('2d')
  })

  it('returns locale date string for timestamps 7+ days ago', () => {
    const iso = new Date(Date.now() - 10 * 86_400_000).toISOString()
    const result = timeAgo(iso)
    // Should be something like "Jun 5" rather than a relative unit
    expect(result).toMatch(/\w{3}\s\d+/)
  })
})

// ── lastMessagePreview ────────────────────────────────────────────────────────

function makeRow(overrides: Partial<ConversationRow> = {}): ConversationRow {
  return {
    conversation_id: 'conv-1',
    type: 'dm',
    club_id: null,
    created_at: new Date().toISOString(),
    last_message_id: 'msg-1',
    last_message_content: null,
    last_message_image_url: null,
    last_message_at: new Date().toISOString(),
    last_message_deleted_at: null,
    last_sender_id: 'other-user',
    last_sender_username: null,
    last_sender_first_name: null,
    last_sender_last_name: null,
    unread_count: 0,
    other_user_id: 'other-user',
    other_user_username: 'jane',
    other_user_first_name: 'Jane',
    other_user_last_name: 'Doe',
    other_user_avatar_url: null,
    other_user_selected_border: null,
    club_name: null,
    club_avatar_url: null,
    my_last_read_at: null,
    ...overrides,
  }
}

describe('lastMessagePreview', () => {
  const MY_ID = 'my-user'

  it('returns "No messages yet" when last_message_at is null', () => {
    const row = makeRow({ last_message_at: null })
    expect(lastMessagePreview(row, MY_ID)).toBe('No messages yet')
  })

  it('returns "Deleted message" when last message is deleted', () => {
    const row = makeRow({ last_message_deleted_at: new Date().toISOString() })
    expect(lastMessagePreview(row, MY_ID)).toBe('Deleted message')
  })

  it('prefixes "You: " when the last sender is the current user', () => {
    const row = makeRow({ last_sender_id: MY_ID, last_message_content: 'Hello' })
    expect(lastMessagePreview(row, MY_ID)).toBe('You: Hello')
  })

  it('shows content without prefix when another user sent the message', () => {
    const row = makeRow({ last_sender_id: 'other-user', last_message_content: 'Hello' })
    expect(lastMessagePreview(row, MY_ID)).toBe('Hello')
  })

  it('shows image placeholder when message is image-only', () => {
    const row = makeRow({
      last_sender_id: 'other-user',
      last_message_content: null,
      last_message_image_url: 'https://example.com/img.jpg',
    })
    expect(lastMessagePreview(row, MY_ID)).toBe('📷 Image')
  })

  it('prefixes "You: " on image-only message from current user', () => {
    const row = makeRow({
      last_sender_id: MY_ID,
      last_message_content: null,
      last_message_image_url: 'https://example.com/img.jpg',
    })
    expect(lastMessagePreview(row, MY_ID)).toBe('You: 📷 Image')
  })

  it('hides club thread preview when last sender is silenced', () => {
    const silenced = new Set(['creepy-user'])
    const row = makeRow({
      type: 'club',
      club_id: 'club-1',
      club_name: 'Spikers',
      other_user_id: null,
      last_sender_id: 'creepy-user',
      last_message_content: 'spam',
    })
    expect(lastMessagePreview(row, MY_ID, silenced)).toBe('Message hidden')
  })

  it('does not hide DM preview by silenced set (DM rows are filtered in UI)', () => {
    const silenced = new Set(['other-user'])
    const row = makeRow({ last_sender_id: 'other-user', last_message_content: 'hi' })
    expect(lastMessagePreview(row, MY_ID, silenced)).toBe('hi')
  })
})

describe('nextFirstItemIndex (web virtualized list, #3)', () => {
  const { nextFirstItemIndex } = require('../utils/chatUtils') as typeof import('../utils/chatUtils')
  const rows = (...ids: string[]) => ids.map(id => ({ id }))

  it('starts at the base and stays put on the first render', () => {
    expect(nextFirstItemIndex({ firstId: null, firstIndex: 1000 }, rows('a', 'b'))).toBe(1000)
  })

  it('drops by the number of messages prepended before the old first one', () => {
    expect(nextFirstItemIndex({ firstId: 'c', firstIndex: 1000 }, rows('a', 'b', 'c', 'd'))).toBe(998)
  })

  it('appends, edits and a removed first row leave it unchanged', () => {
    expect(nextFirstItemIndex({ firstId: 'a', firstIndex: 1000 }, rows('a', 'b', 'new'))).toBe(1000)
    expect(nextFirstItemIndex({ firstId: 'gone', firstIndex: 1000 }, rows('b', 'c'))).toBe(1000)
  })
})

describe('web chat list wiring (#3)', () => {
  const { readFileSync } = require('fs') as typeof import('fs')
  const { resolve } = require('path') as typeof import('path')
  const web = readFileSync(resolve(__dirname, '../components/ChatMessageList.web.tsx'), 'utf8')
  const screen = readFileSync(resolve(__dirname, '../app/(app)/chat/[id].tsx'), 'utf8')

  it('virtualizes with react-virtuoso, opening at the end and loading older on startReached', () => {
    expect(web).toMatch(/from 'react-virtuoso'/)
    expect(web).toMatch(/initialTopMostItemIndex=\{\{ index: 'LAST', align: 'end' \}\}/)
    expect(web).toMatch(/firstItemIndex=\{firstItemIndex\}/)
    expect(web).toMatch(/startReached=\{startReached\}/)
    expect(web).toMatch(/followOutput=\{followOutput\}/)
  })

  it('the screen no longer renders every message on web or scrolls to end before paint', () => {
    expect(screen).not.toMatch(/useLayoutEffect/)
    expect(screen).not.toMatch(/ascendingMessages\.map/)
    expect(screen).toMatch(/<ChatMessageList/)
  })
})

describe('chatImageRef', () => {
  const { chatImageRef } = require('../utils/chatUtils') as typeof import('../utils/chatUtils')
  it('reads a stored object path', () => {
    expect(chatImageRef('u1/123-abc.jpg')).toEqual({ kind: 'path', path: 'u1/123-abc.jpg' })
  })
  it('turns a legacy public URL into its object path', () => {
    expect(chatImageRef('https://ref.supabase.co/storage/v1/object/public/chat-images/u1/1.png'))
      .toEqual({ kind: 'path', path: 'u1/1.png' })
  })
  it('turns an expired signed URL into its object path', () => {
    expect(chatImageRef('https://ref.supabase.co/storage/v1/object/sign/chat-images/u1/1.png?token=x'))
      .toEqual({ kind: 'path', path: 'u1/1.png' })
  })
  it('passes local and other URIs through', () => {
    expect(chatImageRef('blob:http://localhost/abc')).toEqual({ kind: 'direct', uri: 'blob:http://localhost/abc' })
    expect(chatImageRef('file:///tmp/x.jpg')).toEqual({ kind: 'direct', uri: 'file:///tmp/x.jpg' })
    expect(chatImageRef('https://example.com/x.jpg')).toEqual({ kind: 'direct', uri: 'https://example.com/x.jpg' })
  })
  it('is null for no image', () => {
    expect(chatImageRef(null)).toBeNull()
    expect(chatImageRef('')).toBeNull()
  })
})
