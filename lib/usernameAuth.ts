import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { GENERIC_ERROR_MESSAGE, INCORRECT_USERNAME_OR_PASSWORD } from '../constants/copy'
import type { UsernameLoginSession } from '../types'

/** Edge function that resolves a username server-side and signs in (supabase/functions/login-with-username). */
export const LOGIN_WITH_USERNAME_FUNCTION = 'login-with-username'

/**
 * Sign in with a username and password. The email behind the username never
 * reaches this device: the edge function returns a session or a generic error
 * (the same one for an unknown username and a wrong password).
 * Resolves to null on success, else the message to show.
 */
export async function signInWithUsername(username: string, password: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke<UsernameLoginSession>(LOGIN_WITH_USERNAME_FUNCTION, {
    body: { username, password },
  })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await (error.context as Response).json().catch(() => null) as { error?: unknown } | null
      return typeof body?.error === 'string' ? body.error : INCORRECT_USERNAME_OR_PASSWORD
    }
    return GENERIC_ERROR_MESSAGE
  }
  if (!data?.access_token || !data.refresh_token) return GENERIC_ERROR_MESSAGE
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  })
  return sessionError ? GENERIC_ERROR_MESSAGE : null
}
