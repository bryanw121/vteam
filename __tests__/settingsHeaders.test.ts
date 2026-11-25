import { readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { SETTINGS_SCREENS } from '../constants/copy'
import { settingsScreenKey } from '../utils/settingsScreens'

// #377: settings pages get their header (ScreenHeader, a 44-pt Back) from settings/_layout,
// by route. A new settings page without an entry would open with no title and no Back.
const SETTINGS = resolve(__dirname, '..', 'app', '(app)', '(tabs)', 'settings')

function routes(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return routes(path, `${prefix}${name}/`)
    if (!/\.tsx$/.test(name) || name.startsWith('_')) return []
    return [`${prefix}${name.replace(/\.tsx$/, '')}`]
  })
}

describe('settings headers (#377)', () => {
  it('maps segments to the route under settings/', () => {
    expect(settingsScreenKey(['(app)', '(tabs)', 'settings', 'account'])).toBe('account')
    expect(settingsScreenKey(['(app)', '(tabs)', 'settings', 'metrics', '[id]'])).toBe('metrics/[id]')
    expect(settingsScreenKey(['(app)', '(tabs)', 'settings', 'metrics'])).toBe('metrics/index')
    expect(settingsScreenKey(['(app)', '(tabs)', 'settings', 'metrics', 'index'])).toBe('metrics/index')
    expect(settingsScreenKey(['(app)', '(tabs)', 'settings'])).toBe('index')
    expect(settingsScreenKey(['(app)', 'event', '[id]'])).toBe('')
  })

  it('every settings page has a title (the index only redirects)', () => {
    const missing = routes(SETTINGS).filter(r => r !== 'index' && !SETTINGS_SCREENS[r])
    expect(missing).toEqual([])
  })

  it('titles match the Profile menu rows that open them', () => {
    const menu = readFileSync(resolve(__dirname, '..', 'components', 'profile', 'ProfileMenu.tsx'), 'utf8')
    for (const m of menu.matchAll(/\{ title: '([^']+)', icon: '[^']+', section: '([^']+)' \}/g)) {
      const [, title, section] = m
      const key = section === 'metrics' ? 'metrics/index' : section
      expect([key, SETTINGS_SCREENS[key]?.title]).toEqual([key, title])
    }
  })

  it('no settings page sets the native stack header any more', () => {
    for (const r of routes(SETTINGS)) {
      const src = readFileSync(join(SETTINGS, `${r}.tsx`), 'utf8')
      expect([r, /useStackBackTitle|headerTitle:|headerLeft:/.test(src)]).toEqual([r, false])
    }
  })
})
