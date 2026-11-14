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
  // Texas Asian Olympics, Nov 14–15 2026. Public on purpose: every visitor's browser calls it, and
  // scorekeeping is guarded by the Sheet's PIN, not by the URL. EXPO_PUBLIC_TEXASAO_SCORES_URL
  // overrides it (e.g. the Sheet's dev server). Patch the Sheet with Manage deployments → New
  // version so this URL stays the same; a new deployment needs a release here.
  // This is the deployment texasao.org/schedule links ("Open full results"), checked Nov 13: 56 teams,
  // 4 divisions, 220 matches. The URL shipped before it (AKfycbz5Kluc…) is an older deployment that
  // still answers with 3 divisions and test data.
  'texasao-2026-11-14':
    process.env.EXPO_PUBLIC_TEXASAO_SCORES_URL ||
    'https://script.google.com/macros/s/AKfycbxBRkHsAjcWqPHEihn_5vAQV4ToiySOU_HnxsbgUtYu-ILEkCp6XHblq3h1DnIxW1TD/exec',
}

/**
 * Programs where vteam only shows scores: no "I'm a scorekeeper" button and no writes to the Sheet.
 * Texas AO's Sheet has no scorekeeper PIN, and its desk keeps the official scores, so a stray tap in
 * vteam must never change them.
 */
export const SCOREKEEPING_OFF: ReadonlySet<string> = new Set(['texasao-2026-11-14'])

/**
 * Floor for how often the open scores screen refetches; the Sheet's `refresh_seconds` can raise it.
 * 30 s, not the Sheet's own 10: every open screen is a separate call to the organizer's Apps Script,
 * which runs a limited number of requests at once, and vteam must never be what slows their day.
 */
export const LIVE_SCORES_MIN_REFRESH_MS = 30_000
