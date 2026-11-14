import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { HEADERLESS_STACK_ROUTES } from '../constants/navigation'

// A stack screen that draws its own header must also be registered with
// `headerShown: false` in app/(app)/_layout.tsx. Otherwise the stack's default
// header, titled with the raw route name ("event/[id]"), shows until the screen
// mounts, and on web for as long as a lazy chunk loads (#306).
const ROOT = resolve(__dirname, '..')
const APP = join(ROOT, 'app', '(app)')

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '(tabs)' ? [] : routeFiles(path)
    return /\.tsx$/.test(name) && !name.startsWith('_') && !name.startsWith('+') ? [path] : []
  })
}

const routeName = (file: string) => file.slice(APP.length + 1).replace(/\.tsx$/, '').split('\\').join('/')

/** The route's own source, following a one-line re-export (event/[id] → EventDetailRoute → EventDetailScreen). */
function screenSource(file: string): string {
  const src = readFileSync(file, 'utf8')
  const reexport = src.match(/export \{ default \} from '([^']+)'/)
  if (!reexport) return src
  const target = resolve(file, '..', reexport[1])
  const candidates = [`${target}.tsx`, target.replace(/Route$/, 'Screen') + '.tsx']
  return candidates.filter(existsSync).map(f => readFileSync(f, 'utf8')).join('\n')
}

describe('headerless stack routes', () => {
  const files = routeFiles(APP)

  it('registers every screen that hides the stack header', () => {
    const missing = files
      .filter(f => /headerShown:\s*false/.test(screenSource(f)))
      .map(routeName)
      .filter(name => !(HEADERLESS_STACK_ROUTES as readonly string[]).includes(name))
    expect(missing).toEqual([])
  })

  it('lists only routes that exist', () => {
    const names = files.map(routeName)
    expect(HEADERLESS_STACK_ROUTES.filter(r => !names.includes(r))).toEqual([])
  })

  it('is used by both stacks in the app layout', () => {
    const layout = readFileSync(join(APP, '_layout.tsx'), 'utf8')
    expect(layout.match(/HEADERLESS_STACK_ROUTES\.map/g)).toHaveLength(2)
    for (const r of HEADERLESS_STACK_ROUTES) expect(layout).not.toContain(`name="${r}"`)
  })
})
