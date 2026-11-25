import { APPEARANCE_STORAGE_KEY, DOCUMENT_BACKGROUND, parseAppearance, resolveColorScheme } from '../constants/colorScheme'
import { buildColorSchemeScript } from '../utils/colorSchemeScript'
import { colorScheme, darkColors, lightColors, theme } from '../constants/theme'

describe('parseAppearance', () => {
  it('keeps light and dark, and anything else is Match device', () => {
    expect(parseAppearance('light')).toBe('light')
    expect(parseAppearance('dark')).toBe('dark')
    expect(parseAppearance('system')).toBe('system')
    expect(parseAppearance(null)).toBe('system')
    expect(parseAppearance('Dark')).toBe('system')
  })
})

describe('resolveColorScheme', () => {
  it('a fixed choice wins over the device', () => {
    expect(resolveColorScheme('light', 'dark')).toBe('light')
    expect(resolveColorScheme('dark', 'light')).toBe('dark')
  })
  it('Match device follows the device, light when it says nothing', () => {
    expect(resolveColorScheme('system', 'dark')).toBe('dark')
    expect(resolveColorScheme('system', 'light')).toBe('light')
    expect(resolveColorScheme('system', null)).toBe('light')
  })
})

describe('theme', () => {
  it('is light when nothing picked a scheme (tests, the server, api/)', () => {
    expect(colorScheme).toBe('light')
    expect(theme.colors).toBe(lightColors)
  })

  it('is dark when the startup module picked dark', () => {
    jest.isolateModules(() => {
      ;(globalThis as { __vteamColorScheme?: string }).__vteamColorScheme = 'dark'
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fresh = require('../constants/theme') as typeof import('../constants/theme')
        expect(fresh.colorScheme).toBe('dark')
        expect(fresh.theme.colors.background).toBe(darkColors.background)
      } finally {
        delete (globalThis as { __vteamColorScheme?: string }).__vteamColorScheme
      }
    })
  })
})

describe('buildColorSchemeScript', () => {
  function run(stored: string | null, systemDark: boolean) {
    const meta = { content: DOCUMENT_BACKGROUND.light, setAttribute(_: string, v: string) { this.content = v } }
    const documentElement = { dataset: {} as Record<string, string> }
    const fn = new Function('localStorage', 'matchMedia', 'document', buildColorSchemeScript())
    fn(
      { getItem: (k: string) => (k === APPEARANCE_STORAGE_KEY ? stored : null) },
      () => ({ matches: systemDark }),
      { documentElement, querySelector: () => meta },
    )
    return { theme: documentElement.dataset.theme, toolbar: meta.content }
  }

  it('marks the page dark before it paints when dark applies', () => {
    expect(run('dark', false)).toEqual({ theme: 'dark', toolbar: DOCUMENT_BACKGROUND.dark })
    expect(run(null, true)).toEqual({ theme: 'dark', toolbar: DOCUMENT_BACKGROUND.dark })
  })

  it('leaves the page light otherwise', () => {
    expect(run('light', true)).toEqual({ theme: undefined, toolbar: DOCUMENT_BACKGROUND.light })
    expect(run(null, false)).toEqual({ theme: undefined, toolbar: DOCUMENT_BACKGROUND.light })
  })

  it('never throws, even without storage', () => {
    expect(() => new Function('localStorage', 'matchMedia', 'document', buildColorSchemeScript())(undefined, undefined, undefined)).not.toThrow()
  })
})
