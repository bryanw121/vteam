import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { IDLE, PULL_MAX, PULL_RESISTANCE, PULL_TRIGGER, pullEnd, pullMove, pullStart, type PullState } from '../lib/pullGesture'

/** Touch down at (0, 0) at the top, then move through `points`; returns the final state. */
function drag(points: Array<[number, number]>, { atTop = true, touches = 1 } = {}): PullState {
  let s = pullStart(atTop, touches, 0, 0)
  for (const [x, y] of points) s = pullMove(s, touches, x, y)
  return s
}

const pastTrigger = Math.ceil(PULL_TRIGGER / PULL_RESISTANCE) + 1

describe('pull gesture', () => {
  it('a pull past the trigger refreshes on release', () => {
    expect(pullEnd(drag([[0, 10], [0, pastTrigger]]))).toBe(true)
  })

  it('releasing below the trigger does not refresh', () => {
    expect(pullEnd(drag([[0, 10], [0, pastTrigger - 10]]))).toBe(false)
  })

  it('applies resistance and caps the travel', () => {
    const s = drag([[0, 10], [0, 100]])
    expect(s).toMatchObject({ phase: 'pulling', pull: 100 * PULL_RESISTANCE })
    expect(drag([[0, 10], [0, 1000]])).toMatchObject({ pull: PULL_MAX })
  })

  it('never starts mid-scroll', () => {
    expect(pullStart(false, 1, 0, 0)).toEqual(IDLE)
    expect(pullEnd(drag([[0, 10], [0, pastTrigger]], { atTop: false }))).toBe(false)
  })

  it('ignores multi-touch (pinch zoom)', () => {
    expect(pullEnd(drag([[0, 10], [0, pastTrigger]], { touches: 2 }))).toBe(false)
    const s = pullMove(drag([[0, 10]]), 2, 0, pastTrigger)
    expect(s).toEqual(IDLE)
  })

  it('hands horizontal swipes (Pager, chip strip) and upward scrolls back untouched', () => {
    expect(drag([[30, 5]])).toEqual(IDLE)
    expect(drag([[0, -20]])).toEqual(IDLE)
    // Once abandoned, swinging back down doesn't revive it.
    expect(pullEnd(drag([[30, 5], [0, pastTrigger]]))).toBe(false)
  })

  it('a tap-sized wobble stays armed instead of deciding an axis', () => {
    expect(drag([[2, 3]]).phase).toBe('armed')
    expect(pullEnd(drag([[2, 3]]))).toBe(false)
  })
})

describe('RefreshControl import guard', () => {
  const ROOT = resolve(__dirname, '..')
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap(name => {
      const p = join(dir, name)
      return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(name) ? [p] : []
    })

  it("nothing imports RefreshControl from 'react-native' (it is a no-op stub on web, #35)", () => {
    const offenders = ['app', 'components', 'hooks']
      .flatMap(d => sources(join(ROOT, d)))
      .filter(f => !/components\/RefreshControl(\.web)?\.tsx$/.test(f))
      .filter(f => {
        const src = readFileSync(f, 'utf8')
        return [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'react-native'/g)].some(m => /\bRefreshControl\b/.test(m[1]))
      })
      .map(f => f.slice(ROOT.length + 1))
    expect(offenders).toEqual([])
  })
})

describe('doc-scroll wiring (narrow mobile web, where the body scrolls)', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')

  it('DocScrollView hands its refreshControl to DocPullToRefresh instead of dropping it', () => {
    expect(read('components/DocScrollView.tsx')).toMatch(/\{pull && <DocPullToRefresh \{\.\.\.pull\} \/>\}/)
  })

  it("the Events feed's hand-rolled doc-scroll branch mounts DocPullToRefresh", () => {
    const feed = read('app/(app)/(tabs)/(main)/index.tsx')
    const branch = feed.slice(feed.indexOf('if (docScrollActive) {'), feed.indexOf('if (emptyOrLoading) {'))
    expect(branch).toMatch(/<DocPullToRefresh \{\.\.\.refreshControl\.props\} \/>/)
  })

  it('the Clubs doc-scroll list passes a refreshControl', () => {
    const clubs = read('app/(app)/(tabs)/clubs.tsx')
    const branch = clubs.slice(clubs.indexOf('<DocScrollView'), clubs.indexOf('</DocScrollView>'))
    expect(branch).toMatch(/refreshControl=\{<RefreshControl/)
  })
})
