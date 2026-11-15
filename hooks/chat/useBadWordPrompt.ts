import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DM_BAD_WORD_PROMPT_COOLDOWN_MS,
  dmMessageContainsBadWord,
  loadDmBadWordPromptAt,
  saveDmBadWordPromptAt,
} from '../../constants/dmBadWords'
import type { MessageWithDetails } from '../../types'

type Args = {
  conversationId: string
  /** Only DMs prompt. */
  isDm: boolean
  myId: string | null
  messages: MessageWithDetails[]
  loading: boolean
}

/**
 * "This player may be unsportsmanlike" (#318, moved out of the chat room): an
 * incoming DM with a bad word asks whether to report, at most once per cooldown
 * per conversation (kept on the device), and never twice for the same message.
 */
export function useBadWordPrompt({ conversationId, isDm, myId, messages, loading }: Args) {
  const [visible, setVisible] = useState(false)
  const [ready, setReady] = useState(false)
  const promptedIds = useRef<Set<string>>(new Set())
  const lastPromptAt = useRef(0)

  useEffect(() => {
    promptedIds.current = new Set()
    lastPromptAt.current = 0
    setVisible(false)
    setReady(false)
    let live = true
    void loadDmBadWordPromptAt(conversationId).then(ts => {
      if (!live) return
      lastPromptAt.current = ts
      setReady(true)
    })
    return () => { live = false }
  }, [conversationId])

  useEffect(() => {
    if (!ready || loading || !myId || !isDm || visible) return
    const now = Date.now()
    for (const m of messages) {
      if (m._sending || m.sender_id === myId || m.deleted_at) continue
      if (!dmMessageContainsBadWord(m.content)) continue
      if (promptedIds.current.has(m.id)) continue
      promptedIds.current.add(m.id)
      if (now - lastPromptAt.current < DM_BAD_WORD_PROMPT_COOLDOWN_MS) continue
      lastPromptAt.current = now
      void saveDmBadWordPromptAt(conversationId, now)
      setVisible(true)
      return
    }
  }, [messages, loading, myId, isDm, visible, ready, conversationId])

  const dismiss = useCallback(() => setVisible(false), [])
  return { visible, dismiss }
}
