import { supabase } from './supabase'
import { shareUrl } from '../constants/share'

/** Where reset emails link: always the https page, so it works from any device (#223). */
export const PASSWORD_RESET_PATH = '/reset-password'

/**
 * Email a password reset link to `email`. The link opens the web app's
 * `/reset-password` (native users finish in the browser: there is no deep link
 * to parse). That URL must be on the Auth redirect allow-list; if it isn't,
 * Auth falls back to the Site URL and the root layout still routes the person
 * to the form. Resolves to an error message, or null when sent.
 */
export async function sendPasswordReset(email: string): Promise<string | null> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
    redirectTo: shareUrl(PASSWORD_RESET_PATH),
  })
  return error ? error.message : null
}

/** `maya@example.com` → `may****@example.com`: enough to recognise, not to copy. */
export function obfuscateEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  const visible = local.slice(0, 3)
  return `${visible}****@${domain}`
}
