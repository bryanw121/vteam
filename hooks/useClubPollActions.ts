import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getQueryData, setQueryData, useMutation } from '../lib/query'
import { toast } from '../lib/toast'
import { useSession } from '../contexts/session'
import { clubPostsKey } from './useClub'
import { pollOf, withMyVotes } from '../utils/clubPoll'
import type { ClubPollKind, ClubPostsData } from '../types'

type CreatePollInput = {
  clubId: string
  question: string
  kind: ClubPollKind
  options: { label: string; starts_at?: string }[]
  multi: boolean
  closesAt: Date | null
  notify: boolean
}

/** Club polls (#175): post a poll (club owners) and vote (members), through the RPCs. */
export function useClubPollActions(clubId: string) {
  const { userId } = useSession()

  const create = useMutation(
    async (input: CreatePollInput) => {
      const { data, error } = await supabase.rpc('create_club_poll', {
        p_club_id: input.clubId,
        p_question: input.question.trim(),
        p_kind: input.kind,
        p_options: input.options,
        p_multi: input.multi,
        p_closes_at: input.closesAt ? input.closesAt.toISOString() : undefined,
        p_notify: input.notify,
      })
      if (error) throw error
      return data as string
    },
    {
      // The composer is a sheet (a Modal: on native it covers toasts), so it shows the error itself.
      invalidates: userId ? [clubPostsKey(clubId, userId)] : [],
    },
  )

  const vote = useMutation(
    async ({ postId, picks }: { postId: string; picks: string[] }) => {
      const { error } = await supabase.rpc('vote_club_poll', { p_post_id: postId, p_option_ids: picks })
      if (error) throw error
    },
    {
      onMutate: ({ postId, picks }) => {
        if (!userId) return
        const key = clubPostsKey(clubId, userId)
        const before = getQueryData<ClubPostsData>(key)
        if (!before) return
        setQueryData<ClubPostsData>(key, {
          ...before,
          posts: before.posts.map(p => {
            const poll = p.id === postId ? pollOf(p) : null
            return poll ? { ...p, club_polls: withMyVotes(poll, userId, picks) } : p
          }),
        })
        return () => setQueryData<ClubPostsData>(key, before)
      },
      onError: e => { toast.error("Couldn't save your vote", e) },
      invalidates: userId ? [clubPostsKey(clubId, userId)] : [],
    },
  )

  const createMutate = create.mutate
  const voteMutate = vote.mutate
  return {
    createPoll: useCallback((input: CreatePollInput) => createMutate(input), [createMutate]),
    creating: create.isPending,
    vote: useCallback((postId: string, picks: string[]) => voteMutate({ postId, picks }), [voteMutate]),
  }
}
