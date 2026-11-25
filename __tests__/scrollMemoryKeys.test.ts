import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { eventScrollKey } from '../utils/scrollMemory'

// #376: on the web the browser's Back remounts a screen, and a DocScrollView
// without a `memoryKey` comes back at the top (the event page did, from a
// profile, until #376). Every DocScrollView names its key, unless it is listed
// below with the reason it shouldn't remember.
const ROOT = resolve(__dirname, '..')

/** file → why it doesn't remember its offset. */
const NO_MEMORY: Record<string, string> = {}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx$/.test(name) ? [path] : []
  })
}

/** Each `<DocScrollView ...>` opening tag in a source file (props up to the first unnested `>`). */
export function docScrollTags(src: string): string[] {
  const tags: string[] = []
  let at = src.indexOf('<DocScrollView')
  while (at >= 0) {
    let depth = 0
    let end = at + 1
    for (; end < src.length; end++) {
      const ch = src[end]
      if (ch === '{') depth++
      else if (ch === '}') depth--
      else if (ch === '>' && depth === 0 && src[end - 1] !== '=') break
    }
    tags.push(src.slice(at, end + 1))
    at = src.indexOf('<DocScrollView', end)
  }
  return tags
}

const missing = ['app', 'components']
  .flatMap(dir => sources(join(ROOT, dir)))
  .map(file => ({ file: file.slice(ROOT.length + 1), tags: docScrollTags(readFileSync(file, 'utf8')) }))
  .filter(({ file, tags }) => !NO_MEMORY[file] && tags.some(tag => !/\bmemoryKey=/.test(tag)))
  .map(({ file }) => file)

describe('scroll memory keys (#376)', () => {
  it('finds the opening tag, props and all', () => {
    const src = '<DocScrollView\n  docScroll={a > b}\n  memoryKey={`x:${id}`}\n  onScroll={e => go(e)}\n>\n<View />'
    expect(docScrollTags(src)).toHaveLength(1)
    expect(docScrollTags(src)[0]).toContain('memoryKey=')
    expect(docScrollTags(src)[0]).toContain('onScroll')
  })

  it('every DocScrollView remembers its offset on the web', () => {
    // Pass `memoryKey` (e.g. eventScrollKey(id, tab), `club:${id}`), or add the file to NO_MEMORY with a reason.
    expect(missing).toEqual([])
  })

  it('keys each event tab separately', () => {
    expect(eventScrollKey('e1', 'details')).toBe('event:e1:details')
    expect(eventScrollKey('e1', 'people')).not.toBe(eventScrollKey('e1', 'details'))
    expect(eventScrollKey('e2', 'details')).not.toBe(eventScrollKey('e1', 'details'))
  })
})
