import { Platform } from 'react-native'
import { isAppPath, routes } from './routes'

/**
 * Guest browsing rules.
 *
 * Guests (not signed in) can browse Events, Clubs, event pages, club pages and
 * other players' profiles. The Chat and Profile tabs render a sign-in prompt in
 * place. The routes below need an account outright, so a guest who lands on one
 * (deep link, back button, typed URL) is sent to the login screen instead.
 */
const PROTECTED_ROUTES: string[] = [
  routes.host(),
  routes.tournamentCreate(),
  routes.notifications(),
  routes.settings(),
  routes.clubCreate(),
  routes.scorekeeper(),
]

export function isProtectedPath(pathname: string): boolean {
  // A conversation needs an account; the /chat tab itself shows a prompt instead.
  if (pathname.startsWith(`${routes.chat()}/`)) return true
  return PROTECTED_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`))
}

/**
 * Where to return after signing in (or after "keep browsing"). Kept in memory,
 * and mirrored to sessionStorage on web because Google/Apple sign-in there is a
 * full-page redirect that would otherwise wipe it.
 */
// Keeps the pre-rename "vclub" prefix so an in-flight redirect survives the deploy.
const STORAGE_KEY = 'vclub.postSignInRedirect'
const AUTH_SCREENS = ['/(auth)', '/login', '/register', '/reset-password']
let pendingRedirect: string | null = null

function webStorage(): Storage | null {
  if (Platform.OS !== 'web') return null
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

export function setPostSignInRedirect(path: string | null) {
  pendingRedirect = path && !AUTH_SCREENS.some(screen => path.startsWith(screen)) ? path : null
  try {
    const storage = webStorage()
    if (pendingRedirect) storage?.setItem(STORAGE_KEY, pendingRedirect)
    else storage?.removeItem(STORAGE_KEY)
  } catch { /* storage blocked: memory copy still works */ }
}

export function takePostSignInRedirect(): string | null {
  let path = pendingRedirect
  try {
    const storage = webStorage()
    path = path ?? storage?.getItem(STORAGE_KEY) ?? null
    storage?.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
  pendingRedirect = null
  // sessionStorage is same-origin but still outside our control: only hand the
  // router an in-app path.
  return isAppPath(path) ? path : null
}

/** Where "Keep browsing without an account" goes: back where the guest was, unless that page needs an account. */
export function takeGuestReturnPath(): string {
  const path = takePostSignInRedirect()
  return path && !isProtectedPath(path) ? path : routes.events()
}
