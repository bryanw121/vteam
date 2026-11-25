/**
 * Screens that are siblings (the tabs, the guest prompts) should put the same
 * thing at the same height: switching tabs must not make a button jump. Each
 * group names its screens and the elements ("anchors") that must line up; the
 * flow (alignment-flow.mjs) measures every anchor's top edge on every screen,
 * and `misalignments` judges the numbers. Pure, tested in alignment.test.mjs.
 */

/** Tops within this many CSS px count as the same height (sub-pixel rounding). */
export const ALIGN_TOLERANCE_PX = 1

export const ALIGN_GROUPS = [
  {
    name: 'Sign-in prompt on account-only tabs',
    signedIn: false,
    routes: ['/chat', '/profile'],
    anchors: [
      { label: 'title', selector: '[data-testid="sign-in-prompt"] [role="heading"]' },
      { label: 'Sign in / Sign up buttons', selector: '[data-testid="sign-in-prompt-actions"]' },
    ],
  },
  {
    // Phones only: the desktop Events header is larger on purpose (EventsHeader).
    name: 'Tab titles',
    signedIn: true,
    surfaces: ['phone', 'small phone'],
    routes: ['/', '/clubs', '/chat'],
    anchors: [{ label: 'title', selector: '[data-testid="screen-title"]' }],
  },
  {
    name: 'Tab titles (guest)',
    signedIn: false,
    surfaces: ['phone', 'small phone'],
    routes: ['/', '/clubs'],
    anchors: [{ label: 'title', selector: '[data-testid="screen-title"]' }],
  },
]

/** Viewports and text sizes every group is checked at. */
export const ALIGN_SURFACES = [
  { name: 'phone', viewport: { width: 390, height: 844 } },
  { name: 'small phone', viewport: { width: 320, height: 640 } },
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
]
export const ALIGN_TEXT_SIZES = ['default', 'xlarge']

/**
 * @param {{ group: string, surface: string, textSize: string, tops: Record<string, Record<string, number | null>> }} m
 *   `tops[route][anchor label]`: the anchor's top in CSS px, or null when it wasn't on screen.
 * @returns {string[]} one line per problem
 */
export function misalignments({ group, surface, textSize, tops }) {
  const where = `${group} (${surface}, ${textSize} text)`
  const routes = Object.keys(tops)
  const labels = [...new Set(routes.flatMap(r => Object.keys(tops[r])))]
  const problems = []
  for (const label of labels) {
    const found = routes.filter(r => typeof tops[r][label] === 'number')
    for (const r of routes.filter(r => !found.includes(r))) problems.push(`${where}: "${label}" not found on ${r}`)
    if (found.length < 2) continue
    const ys = found.map(r => tops[r][label])
    const spread = Math.max(...ys) - Math.min(...ys)
    if (spread > ALIGN_TOLERANCE_PX) {
      problems.push(`${where}: "${label}" sits at different heights (${found.map(r => `${r} ${Math.round(tops[r][label])}px`).join(', ')}; ${Math.round(spread)}px apart)`)
    }
  }
  return problems
}
