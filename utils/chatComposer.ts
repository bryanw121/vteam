import { profileDisplayName } from './index'
import type { ActiveMention, MentionUser } from '../types'

/**
 * Pure rules for the chat room's composer (#318): @mentions and when Send is on.
 * The hook (`hooks/chat/useChatComposer`) holds the state; this file decides.
 */

/** How many @mention suggestions show at once. */
export const MENTION_SUGGESTIONS = 6

/** Empty string for a missing profile; otherwise the shared member display name. */
export function chatPeerName(p: { first_name: string | null; last_name: string | null; username: string } | null | undefined): string {
  return p ? profileDisplayName(p) : ''
}

/** The @word being typed right before the cursor, if any (only when there is someone to mention). */
export function detectMention(text: string, cursor: number, hasUsers: boolean): ActiveMention | null {
  if (!hasUsers) return null
  const before = text.slice(0, cursor)
  const match = before.match(/(^|\s)@(\w*)$/)
  return match ? { query: match[2], atIndex: before.lastIndexOf('@') } : null
}

/** The text with the @word replaced by `@username `, and where the cursor lands. */
export function applyMention(text: string, mention: ActiveMention, cursor: number, username: string): { text: string; cursor: number } {
  const before = text.slice(0, mention.atIndex)
  const after = text.slice(cursor)
  return { text: `${before}@${username} ${after}`, cursor: mention.atIndex + username.length + 2 }
}

/** Ids of the people @mentioned in a message, once each, in order (unknown usernames are skipped). */
export function mentionIdsIn(text: string, users: MentionUser[]): string[] {
  if (users.length === 0) return []
  return [...new Set(
    [...text.matchAll(/@(\w+)/g)]
      .map(m => users.find(u => u.username === m[1])?.id)
      .filter((id): id is string => Boolean(id)),
  )]
}

/** Who to suggest for the @word being typed: name or username contains it, first six. */
export function mentionSuggestions(users: MentionUser[], mention: ActiveMention | null): MentionUser[] {
  if (!mention || users.length === 0) return []
  const q = mention.query.toLowerCase()
  return users
    .filter(u => !q || u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
    .slice(0, MENTION_SUGGESTIONS)
}

/** Send is on for an edit with text, or a new message with text or a picture while nothing is sending. */
export function canSend(s: { text: string; imageUri: string | null; editing: boolean; sending: boolean }): boolean {
  return s.editing ? s.text.trim().length > 0 : (s.text.trim().length > 0 || !!s.imageUri) && !s.sending
}
