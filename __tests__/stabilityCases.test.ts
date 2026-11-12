import { readFileSync } from 'fs'
import { join } from 'path'
import { VIEW } from '../utils/urlViews'

/**
 * Every shareable-link view has a round-trip case in the stability check (#255):
 * scripts/shots/stabilityCases.mjs lists them as `view: '<key>'`. Read as text,
 * since Jest doesn't load the harness's ES modules.
 */
function viewsWithCases(): string[] {
  const src = readFileSync(join(__dirname, '..', 'scripts/shots/stabilityCases.mjs'), 'utf8')
  const start = src.indexOf('export const LINK_CASES')
  const end = src.indexOf(']', src.indexOf('\n]', start))
  return [...new Set([...src.slice(start, end).matchAll(/^  \{ view: '([a-zA-Z]+)'/gm)].map(m => m[1]))].sort()
}

describe('stability link cases (#255)', () => {
  const withCases = viewsWithCases()

  it('finds the cases', () => {
    expect(withCases.length).toBeGreaterThan(5)
  })

  it('has a case for every VIEW entry', () => {
    const missing = Object.keys(VIEW).filter(k => !withCases.includes(k))
    expect(missing).toEqual([])
  })

  it('names only views that exist', () => {
    expect(withCases.filter(k => !(k in VIEW))).toEqual([])
  })
})
