import { APPEARANCE_STORAGE_KEY, parseAppearance, resolveColorScheme } from '../constants/colorScheme'

// Runs before any other app module (index.js imports it first), so
// constants/theme.ts sees the scheme when it builds its colours. Every
// StyleSheet reads those colours once, so changing the scheme reloads the page.

function storedPref() {
  try { return parseAppearance(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)) } catch { return parseAppearance(null) }
}

function systemScheme(): 'light' | 'dark' {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' } catch { return 'light' }
}

if (typeof window !== 'undefined') {
  const pref = storedPref()
  const scheme = resolveColorScheme(pref, systemScheme())
  ;(globalThis as { __vteamColorScheme?: string }).__vteamColorScheme = scheme
  try { document.documentElement.dataset.theme = scheme } catch {}

  // "Match device": follow the browser when it switches (sunset, a settings
  // change), but never while someone is typing; then on the next return to the tab.
  if (pref === 'system') {
    try {
      const query = window.matchMedia('(prefers-color-scheme: dark)')
      const typing = () => {
        const el = document.activeElement as HTMLElement | null
        return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      }
      const reloadWhenIdle = () => {
        if (resolveColorScheme(storedPref(), systemScheme()) === scheme) return
        if (!document.hidden && !typing()) { window.location.reload(); return }
        const onVisible = () => {
          if (document.hidden || typing()) return
          document.removeEventListener('visibilitychange', onVisible)
          reloadWhenIdle()
        }
        document.addEventListener('visibilitychange', onVisible)
      }
      query.addEventListener('change', reloadWhenIdle)
    } catch {}
  }
}
