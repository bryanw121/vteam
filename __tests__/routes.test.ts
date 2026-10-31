import { routes, isAppPath } from '../utils/routes'

describe('isAppPath', () => {
  it('accepts in-app absolute paths', () => {
    for (const p of ['/', '/event/abc', '/event/abc?from=%2Fclubs', '/(app)', '/host?mode=templates']) {
      expect(isAppPath(p)).toBe(true)
    }
  })

  it('rejects external, protocol-relative and non-string values', () => {
    for (const p of ['//evil.com', 'https://evil.com', '/redirect?to=https://evil.com', 'javascript:alert(1)', 'event/abc', '', null, undefined, 5]) {
      expect(isAppPath(p)).toBe(false)
    }
  })
})

describe('routes', () => {
  it('builds the tab routes', () => {
    expect(routes.events()).toBe('/')
    expect(routes.clubs()).toBe('/clubs')
    expect(routes.chat()).toBe('/chat')
    expect(routes.profile()).toBe('/profile')
  })

  it('builds detail routes', () => {
    expect(routes.event('e1')).toBe('/event/e1')
    expect(routes.club('c1')).toBe('/club/c1')
    expect(routes.clubCreate()).toBe('/club/create')
    expect(routes.profileOf('u1')).toBe('/profile/u1')
    expect(routes.conversation('m1')).toBe('/chat/m1')
    expect(routes.tournament('t1')).toBe('/tournament/t1')
    expect(routes.tournamentCreate()).toBe('/tournament/create')
    expect(routes.tournaments()).toBe('/tournaments')
    expect(routes.notifications()).toBe('/notifications')
  })

  it('encodes the back target of eventFrom', () => {
    expect(routes.eventFrom('e1', '/settings/hosted')).toBe('/event/e1?from=%2Fsettings%2Fhosted')
    expect(routes.eventFrom('e1', '/settings/history?filter=past')).toBe(
      '/event/e1?from=%2Fsettings%2Fhistory%3Ffilter%3Dpast',
    )
  })

  it('builds host routes with optional params', () => {
    expect(routes.host()).toBe('/host')
    expect(routes.host({ maxAttendees: 18 })).toBe('/host?maxAttendees=18')
    expect(routes.host({ mode: 'templates' })).toBe('/host?mode=templates')
    expect(routes.host({ edit: 'e1' })).toBe('/host?edit=e1')
    expect(routes.host({ edit: 'e1', maxAttendees: 10, mode: 'templates' })).toBe(
      '/host?edit=e1&maxAttendees=10&mode=templates',
    )
    // "Already booked? Create a vteam event for it" from Book a court
    expect(routes.host({ location: 'Roots · Treehouse Gym', surface: 'indoor' })).toBe(
      '/host?location=Roots%20%C2%B7%20Treehouse%20Gym&surface=indoor',
    )
  })

  it('builds the public Book a court route', () => {
    expect(routes.book()).toBe('/book')
  })

  it('builds settings routes', () => {
    expect(routes.settings()).toBe('/settings')
    expect(routes.settings('account')).toBe('/settings/account')
    expect(routes.settings('notifications')).toBe('/settings/notifications')
    expect(routes.settings('badges')).toBe('/settings/badges')
    expect(routes.settings('ad-free')).toBe('/settings/ad-free')
  })

  it('builds group routes', () => {
    expect(routes.login()).toBe('/(auth)/login')
    expect(routes.register()).toBe('/(auth)/register')
    expect(routes.app()).toBe('/(app)')
  })
})

describe('isAppPath backslash', () => {
  it('rejects paths browsers would treat as protocol-relative', () => {
    expect(isAppPath('/\\evil.com')).toBe(false)
    expect(isAppPath('/event/1\\x')).toBe(false)
  })
})
