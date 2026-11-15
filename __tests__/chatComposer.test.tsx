import { act, renderHook } from '@testing-library/react-native'

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'file://pic.jpg' }] }) }))
const mockAlert = jest.fn()
jest.mock('../utils/chatUtils', () => ({ chatAlert: (...a: unknown[]) => mockAlert(...a) }))
const mockLoadAt = jest.fn(async (_id: string) => 0)
const mockSaveAt = jest.fn(async (_id: string, _ts: number) => {})
jest.mock('../constants/dmBadWords', () => ({
  DM_BAD_WORD_PROMPT_COOLDOWN_MS: 60 * 60 * 1000,
  dmMessageContainsBadWord: (c: string | null) => !!c && c.includes('badword'),
  loadDmBadWordPromptAt: (id: string) => mockLoadAt(id),
  saveDmBadWordPromptAt: (id: string, ts: number) => mockSaveAt(id, ts),
}))

import { useChatComposer } from '../hooks/chat/useChatComposer'
import { useBadWordPrompt } from '../hooks/chat/useBadWordPrompt'
import { applyMention, canSend, chatPeerName, detectMention, mentionIdsIn, mentionSuggestions } from '../utils/chatComposer'
import type { MentionUser, MessageWithDetails } from '../types'

const USERS: MentionUser[] = [
  { id: 'u1', username: 'maya', displayName: 'Maya Chen' },
  { id: 'u2', username: 'jordan', displayName: 'Jordan Lee' },
]
const msg = (over: Partial<MessageWithDetails> = {}) => ({ id: 'm1', content: 'hi', sender_id: 'other', ...over }) as MessageWithDetails

describe('chatComposer rules (#318)', () => {
  it('finds the @word before the cursor only when someone can be mentioned', () => {
    expect(detectMention('hey @ma', 7, true)).toEqual({ query: 'ma', atIndex: 4 })
    expect(detectMention('@', 1, true)).toEqual({ query: '', atIndex: 0 })
    expect(detectMention('email@ma', 8, true)).toBeNull()
    expect(detectMention('hey @ma', 7, false)).toBeNull()
  })

  it('replaces the @word with the username and a space, and moves the cursor after it', () => {
    expect(applyMention('hey @ma and', { query: 'ma', atIndex: 4 }, 7, 'maya')).toEqual({ text: 'hey @maya  and', cursor: 10 })
  })

  it('collects mentioned ids once each, skipping unknown usernames', () => {
    expect(mentionIdsIn('@maya @nobody @jordan @maya', USERS)).toEqual(['u1', 'u2'])
    expect(mentionIdsIn('@maya', [])).toEqual([])
  })

  it('suggests by name or username', () => {
    expect(mentionSuggestions(USERS, { query: 'lee', atIndex: 0 }).map(u => u.id)).toEqual(['u2'])
    expect(mentionSuggestions(USERS, { query: '', atIndex: 0 })).toHaveLength(2)
    expect(mentionSuggestions(USERS, null)).toEqual([])
  })

  it('turns Send on for text or a picture, an edit only with text, never while sending', () => {
    expect(canSend({ text: ' ', imageUri: null, editing: false, sending: false })).toBe(false)
    expect(canSend({ text: '', imageUri: 'x', editing: false, sending: false })).toBe(true)
    expect(canSend({ text: 'a', imageUri: null, editing: false, sending: true })).toBe(false)
    expect(canSend({ text: '', imageUri: 'x', editing: true, sending: false })).toBe(false)
    expect(chatPeerName(null)).toBe('')
  })
})

function setup(over: Partial<Parameters<typeof useChatComposer>[0]> = {}) {
  const deps = {
    inputRef: { current: { clear: jest.fn(), focus: jest.fn(), blur: jest.fn() } } as never,
    mentionableUsers: USERS,
    sendMessage: jest.fn(async () => true),
    editMessage: jest.fn(async () => true),
    uploadImage: jest.fn(async () => 'chat/pic.jpg' as string | null),
    ...over,
  }
  const hook = renderHook(() => useChatComposer(deps))
  return { ...hook, deps }
}

describe('useChatComposer (#318)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sends text with mentions and the reply, then empties the composer', async () => {
    const { result, deps } = setup()
    const reply = msg({ id: 'r1' })
    act(() => { result.current.onChangeText('hi @maya'); result.current.setReplyTo(reply) })
    await act(async () => { await result.current.send() })
    expect(deps.sendMessage).toHaveBeenCalledWith('hi @maya', null, reply, ['u1'])
    expect(result.current.text).toBe('')
    expect(result.current.replyTo).toBeNull()
  })

  it('a failed send leaves the composer empty (the bubble is the one way to retry)', async () => {
    const { result } = setup({ sendMessage: jest.fn(async () => false) })
    act(() => result.current.onChangeText('lost?'))
    await act(async () => { await result.current.send() })
    expect(result.current.text).toBe('')
  })

  it('a picture that did not upload sends nothing and puts text, picture and reply back', async () => {
    const { result, deps } = setup({ uploadImage: jest.fn(async () => null) })
    const reply = msg({ id: 'r2' })
    await act(async () => { await result.current.pickImage() })
    act(() => { result.current.onChangeText('look'); result.current.setReplyTo(reply) })
    await act(async () => { await result.current.send() })
    expect(deps.sendMessage).not.toHaveBeenCalled()
    expect(result.current.text).toBe('look')
    expect(result.current.imageUri).toBe('file://pic.jpg')
    expect(result.current.replyTo).toBe(reply)
    expect(mockAlert).toHaveBeenCalled()
  })

  it('a failed edit puts the edit back in the composer', async () => {
    jest.useFakeTimers()
    const { result, deps } = setup({ editMessage: jest.fn(async () => false) })
    const own = msg({ id: 'e1', content: 'old' })
    act(() => result.current.startEdit(own))
    act(() => result.current.onChangeText('new'))
    await act(async () => { await result.current.send() })
    expect(deps.editMessage).toHaveBeenCalledWith('e1', 'new')
    expect(result.current.editingMessage).toBe(own)
    expect(result.current.text).toBe('new')
    jest.useRealTimers()
  })

  it('picking a suggestion completes the @word', () => {
    const { result } = setup()
    act(() => result.current.onSelectionChange(3))
    act(() => result.current.onChangeText('@jo'))
    expect(result.current.suggestions.map(u => u.id)).toEqual(['u2'])
    act(() => result.current.selectMention(USERS[1]))
    expect(result.current.text).toBe('@jordan ')
    expect(result.current.suggestions).toEqual([])
  })
})

describe('useBadWordPrompt (#318)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('asks once for an incoming DM with a bad word, and not for my own or for a club chat', async () => {
    const base = { conversationId: 'c1', isDm: true, myId: 'me', loading: false }
    const mine = renderHook(() => useBadWordPrompt({ ...base, messages: [msg({ sender_id: 'me', content: 'badword' })] }))
    await act(async () => {})
    expect(mine.result.current.visible).toBe(false)
    const club = renderHook(() => useBadWordPrompt({ ...base, isDm: false, messages: [msg({ content: 'badword' })] }))
    await act(async () => {})
    expect(club.result.current.visible).toBe(false)
    const dm = renderHook(() => useBadWordPrompt({ ...base, messages: [msg({ content: 'badword' })] }))
    await act(async () => {})
    expect(dm.result.current.visible).toBe(true)
    expect(mockSaveAt).toHaveBeenCalledTimes(1)
    act(() => dm.result.current.dismiss())
    expect(dm.result.current.visible).toBe(false)
  })

  it('stays quiet within the cooldown', async () => {
    mockLoadAt.mockResolvedValueOnce(Date.now() - 1000)
    const dm = renderHook(() => useBadWordPrompt({ conversationId: 'c2', isDm: true, myId: 'me', loading: false, messages: [msg({ content: 'badword' })] }))
    await act(async () => {})
    expect(dm.result.current.visible).toBe(false)
  })
})
