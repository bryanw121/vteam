/**
 * Pure helpers for scripts/shots/upgrade-flow.mjs (#317), unit-tested in
 * scripts/shots/upgrade.test.mjs.
 */

/** What the error screen says, in every build since #316 and before it. */
export const CRASH_TITLES = ['This screen hit a snag', 'Still not working', 'Something went wrong']

/** The error screen's title if the page shows it, else null. */
export async function crashText(page) {
  for (const t of CRASH_TITLES) {
    if (await page.getByText(t, { exact: true }).count()) return t
  }
  return null
}

/**
 * Playwright storageState saved on one origin, re-homed to another (the two
 * exports are served on different ports, and localStorage is per origin).
 * Cookies are dropped: the app keeps nothing in them.
 */
export function moveStorage(state, fromOrigin, toOrigin) {
  const from = new URL(fromOrigin).origin
  const to = new URL(toOrigin).origin
  return {
    cookies: [],
    origins: (state.origins ?? []).filter(o => o.origin === from).map(o => ({ ...o, origin: to })),
  }
}

/** The app's own device keys in a storage state (`vteam.*`, sorted), for the report. */
export function deviceKeys(state, origin) {
  const o = (state.origins ?? []).find(x => x.origin === new URL(origin).origin)
  return (o?.localStorage ?? []).map(e => e.name).filter(n => n.startsWith('vteam.')).sort()
}

/** The job summary: one line per broken screen, with the keys the device had. */
export function renderSummary(results) {
  const failed = results.filter(r => !r.ok)
  const lines = [`## Upgrade check ${failed.length ? `❌ ${failed.length} broke` : `✅ ${results.length} screens opened cleanly`}`, '']
  lines.push('Each screen was opened by this build on a device that had just run the base build (signed in and guest, phone and desktop).', '')
  if (failed.length) {
    lines.push('| Screen | Viewport | Who | What happened | Device keys |', '|---|---|---|---|---|')
    for (const r of failed) {
      const what = [r.crash && `error screen: “${r.crash}”`, ...r.errors].filter(Boolean).join('; ').replace(/\|/g, '\\|')
      lines.push(`| \`${r.path}\` | ${r.viewport} | ${r.who === 'in' ? 'signed in' : 'guest'} | ${what} | ${r.keys.map(k => `\`${k}\``).join(' ')} |`)
    }
    lines.push('', 'A saved shape changed? Bump `VERSION` in `lib/querySnapshot.ts` (or `utils/feedSnapshot.ts`), or make the reader accept the old shape. Frames are in the `a11y-report` artifact under `upgrade/`.')
  }
  return lines.join('\n') + '\n'
}
