import { useCallback } from 'react'
import { TOURNAMENT_ERROR_TITLE as T } from '../../constants/tournamentCopy'
import { getQueryData, invalidate, setQueryData, useMutation, type MutationOptions } from '../../lib/query'
import { patchCommentRow } from '../../utils/commentPages'
import type {
  GeneratedSchedule, SetScore, TimedBracketMatch, TournamentCommentWithAuthor, TournamentCommentsPage, TournamentResultWrites,
} from '../../types'
import * as api from './api'
import { tournamentKeys } from './api'
import { notifyError, notifyInfo } from '../../utils/notify'

/**
 * `useMutation` that resolves to `true` on success, so callers can tell success from
 * failure (both would otherwise be `undefined` for a void write).
 */
/**
 * Apply an edit / soft delete to the cached row before the refetch: the
 * refetch only re-reads the newest page and keeps older loaded pages as they
 * were, so an edit to an older comment would otherwise not show.
 */
function patchCachedComment(tournamentId: string, commentId: string, patch: Partial<TournamentCommentWithAuthor>): void {
  const key = tournamentKeys.comments(tournamentId)
  const page = getQueryData<TournamentCommentsPage>(key)
  if (page) setQueryData<TournamentCommentsPage>(key, patchCommentRow(page, commentId, patch))
}

function useAction<V>(fn: (v: V) => Promise<unknown>, opts?: MutationOptions<V, true>) {
  return useMutation<V, true>(async v => { await fn(v); return true }, opts)
}

/**
 * Every write on the tournament detail screen, as `useMutation`s: each throws on a
 * Supabase error (see api.ts), the user is told via `notifyError`, double taps are
 * ignored while one is pending, and the affected cached reads are invalidated.
 * Each `mutate` resolves to a result on success and `undefined` on failure.
 */
export function useTournamentActions(id: string, userId: string | null) {
  const roster = [tournamentKeys.teams(id), tournamentKeys.minePrefix(id)]

  const register = useAction(
    (v: { name: string; freeAgent: boolean }) => {
      if (!userId) throw new Error('Sign in to register.')
      return api.registerTeam({ tournamentId: id, userId, ...v })
    },
    { invalidates: roster, onError: e => notifyError(T.register, e) },
  )

  const withdraw = useAction(
    (teamId: string) => api.withdrawTeam(teamId),
    { invalidates: roster, onError: e => notifyError(T.withdraw, e) },
  )

  const acceptInvite = useAction(
    (inviteId: string) => api.acceptInvite(inviteId),
    { invalidates: roster, onError: e => notifyError(T.acceptInvite, e) },
  )

  const declineInvite = useAction(
    (inviteId: string) => api.declineInvite(inviteId),
    { invalidates: [tournamentKeys.minePrefix(id)], onError: e => notifyError(T.declineInvite, e) },
  )

  const sendInvite = useAction(
    (v: { teamId: string; inviteeId: string }) => {
      if (!userId) throw new Error('Sign in to invite players.')
      return api.sendInvite({ tournamentId: id, teamId: v.teamId, inviterId: userId, inviteeId: v.inviteeId })
    },
    { onSuccess: () => notifyInfo('Invited', 'They will be notified.'), onError: e => notifyError(T.invite, e) },
  )

  const sendJoinRequest = useAction(
    (teamId: string) => {
      if (!userId) throw new Error('Sign in to request to join.')
      return api.sendJoinRequest({ tournamentId: id, teamId, userId })
    },
    { onSuccess: () => notifyInfo('Request sent', 'The team captain will be notified.'), onError: e => notifyError(T.joinRequest, e) },
  )

  const approveJoinRequest = useAction(
    (v: { requestId: string; requesterId: string; teamId: string }) => api.approveJoinRequest({ tournamentId: id, ...v }),
    { invalidates: roster, onError: e => notifyError(T.reviewRequest, e) },
  )

  const declineJoinRequest = useAction(
    (requestId: string) => api.declineJoinRequest(requestId),
    { invalidates: [tournamentKeys.minePrefix(id)], onError: e => notifyError(T.reviewRequest, e) },
  )

  const approveTeam = useAction(
    (teamId: string) => api.setTeamFlag(teamId, { is_approved: true }),
    { invalidates: [tournamentKeys.teams(id)], onError: e => notifyError(T.team, e) },
  )

  const markPaid = useAction(
    (teamId: string) => api.setTeamFlag(teamId, { is_paid: true }),
    { invalidates: [tournamentKeys.teams(id)], onError: e => notifyError(T.team, e) },
  )

  const removeTeam = useAction(
    (teamId: string) => api.removeTeam(teamId),
    { invalidates: roster, onError: e => notifyError(T.team, e) },
  )

  const movePlayer = useAction(
    (v: { fromTeamId: string; userId: string; toTeamId: string }) => api.movePlayer(v),
    { invalidates: roster, onError: e => notifyError(T.movePlayer, e) },
  )

  const assignFreeAgent = useAction(
    (v: { freeAgentTeamId: string; userId: string; targetTeamId: string }) => api.assignFreeAgent(v),
    { invalidates: roster, onError: e => notifyError(T.movePlayer, e) },
  )

  const publishTournament = useAction<void>(
    () => api.publishTournament(id),
    { invalidates: [tournamentKeys.core(id)], onError: e => notifyError(T.publish, e) },
  )

  const publishSchedule = useAction<void>(
    () => api.publishSchedule(id),
    { invalidates: [tournamentKeys.core(id)], onError: e => notifyError(T.publish, e) },
  )

  const schedule = [tournamentKeys.core(id), tournamentKeys.matches(id), tournamentKeys.pools(id)]

  const replaceSchedule = useAction(
    (generated: GeneratedSchedule) => api.replaceSchedule(id, generated),
    { invalidates: schedule, onError: e => notifyError(T.schedule, e) },
  )

  const seedBracket = useAction(
    (rows: TimedBracketMatch[]) => api.seedBracket(id, rows),
    { invalidates: [tournamentKeys.matches(id)], onError: e => notifyError(T.bracket, e) },
  )

  const recordResult = useAction(
    (v: { matchId: string; winnerId: string; sets: SetScore[]; forfeit: boolean; writes: TournamentResultWrites }) =>
      api.recordResult({ tournamentId: id, ...v }),
    // Status may change (in progress / completed), so the core row refetches too.
    { invalidates: [tournamentKeys.core(id), tournamentKeys.matches(id)], onError: e => notifyError(T.result, e) },
  )

  const saveSeeds = useAction(
    (seeds: { teamId: string; seed: number | null }[]) => api.saveSeeds(seeds),
    { invalidates: [tournamentKeys.teams(id)], onError: e => notifyError(T.team, e) },
  )

  const saveMatch = useAction(
    (v: { matchId: string; scheduledAt: string; court: string; teamAId: string | null; teamBId: string | null }) => api.saveMatch(v),
    { invalidates: [tournamentKeys.matches(id)], onError: e => notifyError(T.match, e) },
  )

  const addPrize = useAction(
    (v: { placeLabel: string; description: string; amount: string; displayOrder: number }) => api.addPrize({ tournamentId: id, ...v }),
    { invalidates: [tournamentKeys.core(id)], onError: e => notifyError(T.prize, e) },
  )

  const deletePrize = useAction(
    (prizeId: string) => api.deletePrize(prizeId),
    { invalidates: [tournamentKeys.core(id)], onError: e => notifyError(T.prize, e) },
  )

  const deleteComment = useAction(
    async (commentId: string) => {
      await api.deleteComment(commentId)
      patchCachedComment(id, commentId, { deleted_at: new Date().toISOString() })
    },
    { invalidates: [tournamentKeys.comments(id)], onError: e => notifyError(T.comment, e) },
  )

  const postAnnouncement = useAction(
    (body: string) => {
      if (!userId) throw new Error('Sign in to post.')
      return api.insertComment({ tournamentId: id, userId, body, isAnnouncement: true, mentions: [], parentId: null })
    },
    { invalidates: [tournamentKeys.comments(id)], onError: e => notifyError(T.announcement, e) },
  )

  /**
   * Composer submit. Unlike the mutations above this REJECTS on failure: the shared
   * DiscussionComposer keeps the draft when `onPost` throws, so the user can retry.
   */
  const postComment = useCallback(async (v: {
    body: string; isAnnouncement: boolean; mentionIds: string[]; replyToId: string | null; editingId: string | null
  }): Promise<void> => {
    if (!userId) return
    try {
      if (v.editingId) {
        await api.editComment(v.editingId, v.body)
        patchCachedComment(id, v.editingId, { body: v.body, edited_at: new Date().toISOString() })
      } else await api.insertComment({
        tournamentId: id, userId, body: v.body,
        isAnnouncement: v.isAnnouncement, mentions: v.mentionIds, parentId: v.replyToId,
      })
    } catch (e) {
      notifyError(T.comment, e)
      throw e
    }
    invalidate(tournamentKeys.comments(id))
  }, [id, userId])

  return {
    register, withdraw, acceptInvite, declineInvite, sendInvite, sendJoinRequest,
    approveJoinRequest, declineJoinRequest, approveTeam, markPaid, removeTeam, movePlayer, assignFreeAgent,
    publishTournament, publishSchedule, replaceSchedule, seedBracket, recordResult, saveSeeds, saveMatch, addPrize, deletePrize,
    deleteComment, postAnnouncement, postComment,
  }
}

