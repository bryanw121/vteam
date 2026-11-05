import { useCallback } from 'react'
import { useRouter } from 'expo-router'
import { supabase } from '../lib/supabase'
import { getQueryData, useMutation } from '../lib/query'
import { NETWORK_ERROR_MESSAGE } from '../constants/copy'
import { useSession } from '../contexts/session'
import { chatAlert } from '../utils/chatUtils'
import { routes } from '../utils/routes'
import { useRequireSignIn } from './useRequireSignIn'
import { conversationsKey } from './useConversations'
import type { ConversationRow } from '../types'

/**
 * The one definition of "message this person": find or create the DM, then open
 * it (`openDm`), or post one message into it without opening it (`sendDm`). Shared by the event page (Message host, the People-tab roster menu), other
 * players' profiles and the Chat tab's new-message search. Guests go to sign-in
 * first; a failure is reported instead of silently doing nothing.
 */
export function useOpenDm() {
  const router = useRouter()
  const { userId } = useSession()
  const requireSignIn = useRequireSignIn()

  const dm = useMutation(
    findOrCreateDm,
    {
      // A brand-new DM isn't in the chat list yet; an existing one needs no refetch.
      invalidates: (_otherUserId, convId) => {
        if (!userId) return []
        const key = conversationsKey(userId)
        const known = getQueryData<ConversationRow[]>(key)?.some(c => c.conversation_id === convId)
        return known ? [] : [key]
      },
      onSuccess: convId => router.push(routes.conversation(convId)),
      onError: () => chatAlert("Couldn't open chat", NETWORK_ERROR_MESSAGE),
    },
  )

  // Send one message without opening the chat (the leave sheet's note to the host, #171).
  // The caller reports a failure; nothing is shown from here.
  const send = useMutation(
    async ({ otherUserId, text }: { otherUserId: string; text: string }) => {
      if (!userId) throw new Error('Sign in to continue.')
      const convId = await findOrCreateDm(otherUserId)
      const { error } = await supabase.from('messages').insert({ conversation_id: convId, sender_id: userId, content: text })
      if (error) throw error
      return convId
    },
    { invalidates: () => (userId ? [conversationsKey(userId)] : []) },
  )

  const mutate = dm.mutate
  const openDm = useCallback(async (otherUserId: string) => {
    if (!requireSignIn()) return
    if (otherUserId === userId) return
    await mutate(otherUserId)
  }, [requireSignIn, userId, mutate])

  const sendMutate = send.mutate
  /** Resolves true once the message is saved. Never navigates. */
  const sendDm = useCallback(async (otherUserId: string, text: string): Promise<boolean> => {
    if (!userId || otherUserId === userId || !text.trim()) return false
    return (await sendMutate({ otherUserId, text })) !== undefined
  }, [userId, sendMutate])

  return { openDm, opening: dm.isPending, sendDm, sending: send.isPending }
}

async function findOrCreateDm(otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('find_or_create_dm', { other_user_id: otherUserId })
  if (error) throw error
  if (!data) throw new Error('find_or_create_dm returned no conversation')
  return String(data)
}
