import { execSync } from 'child_process'
import { resolve } from 'path'
import { profileAvatarSmallUri } from '../utils'

/**
 * #8: avatars are a public bucket, so the URL is built synchronously. Resolving
 * it in a useEffect costs every row an extra render with a blank avatar (a
 * flash in 50-person rosters). Components use `profileAvatarSmallUri` inline.
 */
describe('avatar URLs resolve synchronously', () => {
  it('builds the URL without awaiting anything', () => {
    expect(profileAvatarSmallUri('u1/a.jpg')).toMatch(/\/storage\/v1\/.*avatars\/u1\/a\.jpg/)
    expect(profileAvatarSmallUri('https://x.test/a.png')).toBe('https://x.test/a.png')
    expect(profileAvatarSmallUri(null)).toBeNull()
  })

  it('no component resolves a small avatar asynchronously', () => {
    const root = resolve(__dirname, '..')
    const hits = execSync('grep -rln "resolveProfileAvatarUriSmall" components app || true', { cwd: root, encoding: 'utf8' }).trim()
    expect(hits).toBe('')
  })
})
