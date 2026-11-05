import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { SWIPE_NAVIGATION } from '../constants/navigation'

// Swipe navigation (tab swipes and iOS swipe-back) is off in the native apps
// and lives behind SWIPE_NAVIGATION in constants/navigation.ts so it can come
// back with a one-line change. These checks keep every navigator reading the
// flag: a hard-coded `gestureEnabled: true`, or a Stack that leaves it unset
// (iOS defaults it to on), would quietly bring the gesture back.
const ROOT = resolve(__dirname, '..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

const rel = (file: string) => file.slice(ROOT.length + 1)
const appFiles = [...sources(join(ROOT, 'app')), ...sources(join(ROOT, 'components'))]

describe('swipe navigation', () => {
  it('is turned off in the native apps', () => {
    expect(SWIPE_NAVIGATION).toEqual({ tabs: false, back: false })
  })

  it('never hard-codes a swipe gesture on', () => {
    const offenders = appFiles.flatMap(file =>
      readFileSync(file, 'utf8').split('\n').flatMap((line, i) =>
        /\bgestureEnabled:\s*true\b/.test(line) ? [`${rel(file)}:${i + 1}`] : [],
      ),
    )
    expect(offenders).toEqual([])
  })

  it('only turns on the iOS full-screen swipe-back behind the flag', () => {
    const offenders = appFiles.flatMap(file => {
      const lines = readFileSync(file, 'utf8').split('\n')
      return lines.flatMap((line, i) => {
        if (!/fullScreenGestureEnabled:\s*true/.test(line)) return []
        const context = lines.slice(Math.max(0, i - 2), i + 1).join('\n')
        return /SWIPE_NAVIGATION\.back\s*&&/.test(context) ? [] : [`${rel(file)}:${i + 1}`]
      })
    })
    expect(offenders).toEqual([])
  })

  it('gives every Stack navigator a gestureEnabled that reads the flag', () => {
    const offenders = appFiles.flatMap(file => {
      const src = readFileSync(file, 'utf8')
      // `<Stack` followed by whitespace or `>`: the navigator, not <Stack.Screen>.
      const navigators = [...src.matchAll(/<Stack(?=[\s>])/g)]
      if (navigators.length === 0) return []
      const flagged = (src.match(/gestureEnabled:\s*SWIPE_NAVIGATION\.back/g) ?? []).length
      return flagged >= navigators.length ? [] : [rel(file)]
    })
    expect(offenders).toEqual([])
  })

  it('has the Pager default its swipe to the flag', () => {
    const src = readFileSync(join(ROOT, 'components/Pager.tsx'), 'utf8')
    expect(src).toMatch(/export function Pager\([^)]*swipeEnabled = SWIPE_NAVIGATION\.tabs/)
    expect(src).not.toMatch(/swipeEnabled = true/)
  })
})
