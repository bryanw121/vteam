import { readFileSync } from 'fs'
import { join } from 'path'
import { APP_NAME } from '../constants'

/**
 * The web tab title. Expo Router's head manager writes an empty <title> into
 * every exported page unless something renders one, and browsers show that as
 * "Untitled". The root layout renders it outside the hydration gate so the
 * static export bakes it in (and the client renders the same string).
 */
const layout = readFileSync(join(__dirname, '..', 'app', '_layout.tsx'), 'utf8')

describe('document title', () => {
  it('is the app name', () => {
    expect(APP_NAME).toBe('VTeam')
  })

  it('is rendered by the root layout through expo-router/head', () => {
    expect(layout).toMatch(/import Head from 'expo-router\/head'/)
    expect(layout).toMatch(/<Head>\s*<title>\{APP_NAME\}<\/title>\s*<\/Head>/)
  })

  it('is outside the hydration gate, so the static export includes it', () => {
    const titleAt = layout.indexOf('<title>{APP_NAME}</title>')
    const gateAt = layout.indexOf('{hydrated && (')
    expect(titleAt).toBeGreaterThan(-1)
    expect(gateAt).toBeGreaterThan(titleAt)
  })
})
