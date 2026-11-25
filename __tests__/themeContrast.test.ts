import { darkColors, lightColors } from '../constants/theme'
import { DOCUMENT_BACKGROUND } from '../constants/colorScheme'

// Every text colour of both palettes stays readable (WCAG AA, 4.5:1) on the
// surfaces it sits on, and white text on the saturated fills.

function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const TEXT = ['text', 'subtext', 'subtextStrong', 'primaryText', 'error', 'warning', 'success', 'warm', 'hot', 'cool'] as const
const SURFACES = ['background', 'card', 'primarySoft'] as const
const WHITE_ON = ['primary', 'coverOpen', 'coverTournament', 'dangerFill'] as const

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
] as const)('%s palette', (_name, colors) => {
  it.each(TEXT.flatMap(t => SURFACES.map(s => [t, s] as const)))('%s on %s is at least 4.5:1', (text, surface) => {
    expect(contrast(colors[text], colors[surface])).toBeGreaterThanOrEqual(4.5)
  })

  it.each(WHITE_ON)('white on %s is at least 4.5:1', fill => {
    expect(contrast(colors.white, colors[fill])).toBeGreaterThanOrEqual(4.5)
  })

  it('the time pill label reads on the pill', () => {
    expect(contrast(colors.timeInk, colors.time)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(colors.timeText, colors.time)).toBeGreaterThanOrEqual(4.5)
  })

  it('the tab bar labels read on the nav pill', () => {
    expect(contrast(colors.navInk, colors.navPill)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(colors.primaryText, colors.navPill)).toBeGreaterThanOrEqual(4.5)
  })
})

it('the page background before the app loads matches each palette', () => {
  expect(DOCUMENT_BACKGROUND.light).toBe(lightColors.background)
  expect(DOCUMENT_BACKGROUND.dark).toBe(darkColors.background)
})

it('both palettes have every token', () => {
  expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort())
})
