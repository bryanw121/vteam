import { readFileSync } from 'fs'
import { join } from 'path'
import { APP_NAME } from '../constants'

/**
 * The web tab title. The exported HTML carries it from app/+html.tsx (Expo
 * Router's head manager only sets document.title once the scripts run, so a tab
 * read "Untitled" while loading and when the browser kept it without running it),
 * and the root layout sets the same string through expo-router/head after that.
 */
const layout = readFileSync(join(__dirname, '..', 'app', '_layout.tsx'), 'utf8')
const html = readFileSync(join(__dirname, '..', 'app', '+html.tsx'), 'utf8')

describe('document title', () => {
  it('is the app name', () => {
    expect(APP_NAME).toBe('VTeam')
  })

  it('is rendered by the root layout through expo-router/head', () => {
    expect(layout).toMatch(/import Head from 'expo-router\/head'/)
    expect(layout).toMatch(/<Head>\s*<title>\{APP_NAME\}<\/title>\s*<\/Head>/)
  })

  it('is in the static HTML, before any script runs', () => {
    expect(html).toMatch(/<title>\{APP_NAME\}<\/title>/)
    expect(html.indexOf('<title>{APP_NAME}</title>')).toBeLessThan(html.indexOf('{headNodes}'))
  })

  it('is outside the hydration gate, so the static export includes it', () => {
    const titleAt = layout.indexOf('<title>{APP_NAME}</title>')
    const gateAt = layout.indexOf('{hydrated && (')
    expect(titleAt).toBeGreaterThan(-1)
    expect(gateAt).toBeGreaterThan(titleAt)
  })
})
