import { isProtectedPath, setPostSignInRedirect, takeGuestReturnPath, takePostSignInRedirect } from '../utils/authGate'

describe('isProtectedPath', () => {
  it('lets guests browse events, clubs, event pages and profiles', () => {
    for (const path of ['/', '/clubs', '/chat', '/profile', '/event/abc', '/club/abc', '/profile/abc', '/tournament/abc', '/book', '/terms', '/privacy']) {
      expect(isProtectedPath(path)).toBe(false)
    }
  })

  it('protects account-only routes and their sub-pages', () => {
    for (const path of ['/host', '/notifications', '/settings', '/settings/account', '/chat/abc', '/tournament/create', '/club/create']) {
      expect(isProtectedPath(path)).toBe(true)
    }
  })

  it('does not match routes that only share a prefix', () => {
    expect(isProtectedPath('/hosted')).toBe(false)
    expect(isProtectedPath('/settingsx')).toBe(false)
  })
})

describe('post sign-in redirect', () => {
  it('is returned once, then cleared', () => {
    setPostSignInRedirect('/event/abc')
    expect(takePostSignInRedirect()).toBe('/event/abc')
    expect(takePostSignInRedirect()).toBeNull()
  })

  it('never redirects back into the auth screens', () => {
    setPostSignInRedirect('/login')
    expect(takePostSignInRedirect()).toBeNull()
    setPostSignInRedirect('/(auth)/register')
    expect(takePostSignInRedirect()).toBeNull()
    setPostSignInRedirect('/register')
    expect(takePostSignInRedirect()).toBeNull()
  })
})

describe('takeGuestReturnPath', () => {
  it('returns to the page the guest came from', () => {
    setPostSignInRedirect('/event/abc')
    expect(takeGuestReturnPath()).toBe('/event/abc')
  })
  it('never sends a guest back to an account-only page', () => {
    setPostSignInRedirect('/host')
    expect(takeGuestReturnPath()).toBe('/')
  })
  it('defaults to Events', () => {
    expect(takeGuestReturnPath()).toBe('/')
  })
})
