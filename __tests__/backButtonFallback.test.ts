import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'

// A back button that calls router.back() on its own does nothing when there is
// no history to go back to: a refreshed web page, a tab the browser reloaded
// after it sat in the background, a deep link or a push tap. Every back
// button checks router.canGoBack() and otherwise goes somewhere sensible.
const ROOT = resolve(__dirname, '..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

const files = ['app', 'components', 'hooks'].flatMap(dir => sources(join(ROOT, dir)))

describe('back buttons', () => {
  it('never call router.back() without a canGoBack() fallback', () => {
    const offenders = files.flatMap(file => {
      const text = readFileSync(file, 'utf8')
      return text.split('\n').flatMap((line, i) => {
        if (!/\brouter\.back\(\)/.test(line) || /^\s*(\/\/|\*)/.test(line)) return []
        // The check sits on the same line or the one or two just above.
        const nearby = text.split('\n').slice(Math.max(0, i - 2), i + 1).join('\n')
        return /canGoBack\(\)/.test(nearby) ? [] : [`${file.slice(ROOT.length + 1)}:${i + 1}`]
      })
    })
    expect(offenders).toEqual([])
  })
})
