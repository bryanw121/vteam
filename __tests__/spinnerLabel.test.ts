import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

/**
 * Every spinner has an accessible name: React Native Web renders
 * ActivityIndicator as role="progressbar", which axe (aria-progressbar-name)
 * and screen readers need named. So app code uses components/ui/Spinner,
 * which always sets one, and never imports ActivityIndicator directly (#137).
 */
const root = join(__dirname, '..')
const ALLOWED = new Set(['components/ui/Spinner.tsx'])

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

describe('spinners are named', () => {
  it('only components/ui/Spinner uses ActivityIndicator', () => {
    const offenders = ['app', 'components', 'hooks', 'lib', 'contexts']
      .flatMap(d => sources(join(root, d)))
      .map(p => relative(root, p).split('\\').join('/'))
      .filter(p => !ALLOWED.has(p) && /\bActivityIndicator\b/.test(readFileSync(join(root, p), 'utf8')))
    expect(offenders).toEqual([])
  })

  it('Spinner defaults its label to "Loading"', () => {
    const src = readFileSync(join(root, 'components/ui/Spinner.tsx'), 'utf8')
    expect(src).toMatch(/label = 'Loading'/)
    expect(src).toMatch(/accessibilityLabel=\{accessibilityLabel \?\? label\}/)
  })
})
