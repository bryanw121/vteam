/**
 * Outside tournaments that run their day on the Google Sheet tournament app
 * (moonflour/volleyball-tournament): Schelagg program id → the Sheet web app's `/exec` URL.
 * vteam reads `<url>?format=json` (public, read-only) for the Scores & brackets screen; the
 * program card still links out to the organizer's own site.
 *
 * Interim: once Schelagg's programs feed carries a `live_url`, this moves into `external_programs`
 * (ingest change) so new tournaments need no app release.
 */
export const LIVE_SCORE_SHEETS: Record<string, string> = {
  // Texas Asian Olympics, Nov 14–15 2026. Set EXPO_PUBLIC_TEXASAO_SCORES_URL to the deployed /exec URL.
  'texasao-2026-11-14': process.env.EXPO_PUBLIC_TEXASAO_SCORES_URL ?? '',
}

/** Floor for how often the open scores screen refetches; the Sheet's `refresh_seconds` can raise it. */
export const LIVE_SCORES_MIN_REFRESH_MS = 10_000
