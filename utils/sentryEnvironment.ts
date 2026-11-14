/** The live Supabase project and the CI-only beta one (CLAUDE.md, "Environments & Deployment"). */
export const LIVE_SUPABASE_REF = 'rmelsdqgrpfjzqisycdl'
export const BETA_SUPABASE_REF = 'uifolvbwtrbcmfrvelnl'

/**
 * The environment Sentry files an error under. It follows the database the
 * build talks to, so a stray EXPO_PUBLIC_APP_ENV can't mislabel production
 * (until Nov 13 the live web build said "beta" and sampled every trace).
 * Other projects (local, the shots mock) keep the build's own label.
 */
export function sentryEnvironment(supabaseUrl: string | undefined, appEnv: string | undefined): string {
  const ref = /^https?:\/\/([^./:]+)\./.exec(supabaseUrl ?? '')?.[1] ?? ''
  if (ref === LIVE_SUPABASE_REF) return 'production'
  if (ref === BETA_SUPABASE_REF) return 'beta'
  return appEnv || 'development'
}
