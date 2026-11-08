import { useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { sendEmailOtp, verifyEmailOtp } from '../lib/socialAuth'
import { queryKey, useMutation, useQuery } from '../lib/query'
import { useSession } from '../contexts/session'
import { needsRecentSignIn } from '../utils/accountDeletion'
import type { AccountDeletionBlock, AccountDeletionPlan } from '../types'

/** Edge function that carries out the deletion (supabase/functions/delete-account). */
export const DELETE_ACCOUNT_FUNCTION = 'delete-account'
/** Typed on the confirm screen and sent to the function as proof of intent. */
export const DELETE_CONFIRMATION = 'DELETE'

const EMPTY_PLAN: AccountDeletionPlan = { clubs: [], tournaments: [], events: [], past_events_kept: 0, kudos_given_kept: 0, hash: '' }

async function fetchPreview(): Promise<AccountDeletionPlan> {
  const { data, error } = await supabase.rpc('get_account_deletion_preview')
  if (error) throw error
  return { ...EMPTY_PLAN, ...((data ?? {}) as Partial<AccountDeletionPlan>) }
}

class DeleteRefused extends Error {
  constructor(message: string, readonly block: AccountDeletionBlock) { super(message) }
}

async function refusalOf(error: unknown): Promise<DeleteRefused> {
  if (error instanceof FunctionsHttpError) {
    const body = await (error.context as Response).json().catch(() => null) as { error?: unknown; code?: unknown } | null
    const block = body?.code === 'reauth_required' || body?.code === 'plan_changed' ? body.code : null
    if (typeof body?.error === 'string') return new DeleteRefused(body.error, block)
  }
  return new DeleteRefused('Could not delete your account. Please try again.', null)
}

/**
 * Account deletion: the preview of what will be deleted or handed over (always
 * fetched fresh; its hash goes back with the delete so a stale screen is
 * refused), a fresh sign-in when the last one is older than 10 minutes, and
 * the delete itself. On success the local session is cleared; the caller navigates away.
 */
export function useAccountDeletion() {
  const { userId, session } = useSession()
  const email = session?.user?.email ?? null
  const preview = useQuery(
    userId ? queryKey('settings', userId, 'deletion-preview') : null,
    fetchPreview,
    { staleMs: 0 },
  )
  const [block, setBlock] = useState<AccountDeletionBlock>(null)
  const needsReauth = block === 'reauth_required' || needsRecentSignIn(session?.access_token, Math.floor(Date.now() / 1000))

  const remove = useMutation<{ confirmation: string; planHash: string }, true>(async ({ confirmation, planHash }) => {
    setBlock(null)
    const { error } = await supabase.functions.invoke(DELETE_ACCOUNT_FUNCTION, { body: { confirm: confirmation, planHash } })
    if (error) {
      const refused = await refusalOf(error)
      setBlock(refused.block)
      if (refused.block === 'plan_changed') void preview.refetch({ force: true })
      throw refused
    }
    // The account is gone server-side; only the device's copy of the session remains.
    await supabase.auth.signOut({ scope: 'local' })
    return true
  })

  /** Re-confirm identity with the account password. Resolves to an error message, or null. */
  async function reauthWithPassword(password: string): Promise<string | null> {
    if (!email) return 'Use an email code instead.'
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return 'That password didn\'t work.'
    setBlock(null)
    return null
  }

  /** Email a one-time code to the account's address (works for Google sign-ins too). */
  async function sendReauthCode(): Promise<string | null> {
    if (!email) return 'No email on this account.'
    try {
      await sendEmailOtp(email)
      return null
    } catch {
      return 'Could not send a code. Please try again.'
    }
  }

  async function verifyReauthCode(code: string): Promise<string | null> {
    if (!email) return 'No email on this account.'
    try {
      await verifyEmailOtp(email, code)
      setBlock(null)
      return null
    } catch {
      return 'That code didn\'t work.'
    }
  }

  return {
    plan: preview.data,
    isLoading: preview.isLoading,
    error: preview.error,
    refetch: preview.refetch,
    email,
    needsReauth,
    block,
    reauthWithPassword,
    sendReauthCode,
    verifyReauthCode,
    deleteAccount: remove.mutate,
    isDeleting: remove.isPending,
    deleteError: remove.error,
  }
}
