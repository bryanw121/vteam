/**
 * The one place `EXPO_PUBLIC_*` variables are read and validated.
 *
 * Expo inlines `process.env.EXPO_PUBLIC_X` at build time, but only for the
 * literal dotted form, so each variable is read by name below (never via
 * `process.env[name]`).
 *
 * Missing Supabase config throws at import in the app. The exception is
 * static export / SSR (`typeof window === 'undefined'`): there the build must
 * still be able to render pages, so it warns and continues with empty values.
 */
const isServer = typeof window === 'undefined'

function required(name: string, value: string | undefined): string {
  if (value) return value
  const message = `Missing ${name}. Set it in .env (local), the CI/EAS environment, or your hosting provider.`
  if (isServer) {
    console.warn(`[env] ${message} Continuing with an empty value because this is a static export / server render.`)
    return ''
  }
  throw new Error(message)
}

const supabaseUrl = required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL).replace(/\/+$/, '')
const supabaseAnonKey = required('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)

/**
 * Project ref from a hosted URL (`https://<ref>.supabase.co`). Empty for a local
 * stack (`http://localhost:54321`). Parsed with a regex because React Native's
 * built-in `URL` does not implement `hostname`.
 */
function parseSupabaseRef(url: string): string {
  return /^https?:\/\/([^./:]+)\./.exec(url)?.[1] ?? ''
}

export const env = Object.freeze({
  supabaseUrl,
  supabaseAnonKey,
  supabaseRef: parseSupabaseRef(supabaseUrl),
  /** Optional: error reporting is off when unset. */
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN as string | undefined,
  /** Web Push public key (#189, base64url): web push is offered only when set. */
  vapidPublicKey: (process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim(),
  /** `development` | `preview` | `production` (set per profile in eas.json). */
  appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? 'production',
})
