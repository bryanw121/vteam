import {
  CHAT_TAB_INDEX,
  CREATE_MENU,
  TABS,
  tabForPath,
  tabIndexFromPath,
} from '../constants/navigation'

describe('TABS', () => {
  it('lists the four tabs in pager order', () => {
    expect(TABS.map(t => t.key)).toEqual(['events', 'clubs', 'chat', 'profile'])
  })

  it('has pageIndex equal to the array index', () => {
    TABS.forEach((tab, i) => expect(tab.pageIndex).toBe(i))
  })

  it('has exactly one chat tab and CHAT_TAB_INDEX points at it', () => {
    expect(TABS.filter(t => t.key === 'chat')).toHaveLength(1)
    expect(TABS[CHAT_TAB_INDEX].key).toBe('chat')
  })

  it('has unique keys and paths', () => {
    expect(new Set(TABS.map(t => t.key)).size).toBe(TABS.length)
    expect(new Set(TABS.map(t => t.path)).size).toBe(TABS.length)
  })

  it('labels Profile as "Me" in the mobile bar', () => {
    expect(TABS.find(t => t.key === 'profile')?.mobileLabel).toBe('Me')
  })

  it('doc-scrolls everything except chat', () => {
    expect(TABS.filter(t => !t.docScroll).map(t => t.key)).toEqual(['chat'])
  })
})

describe('tabForPath / tabIndexFromPath', () => {
  it.each([
    ['/', 'events', 0],
    ['/event/abc', 'events', 0],
    ['/host', 'events', 0],
    ['/clubs', 'clubs', 1],
    ['/club/abc', 'clubs', 1],
    ['/chat', 'chat', 2],
    ['/chat/abc', 'chat', 2],
    ['/profile', 'profile', 3],
    ['/profile/abc', 'profile', 3],
    ['/settings/account', 'profile', 3],
  ])('%s -> %s', (path, key, index) => {
    expect(tabForPath(path).key).toBe(key)
    expect(tabIndexFromPath(path)).toBe(index)
  })

  it('maps every tab path back to its own tab', () => {
    TABS.forEach(tab => expect(tabForPath(tab.path)).toBe(tab))
  })
})

describe('CREATE_MENU', () => {
  it('groups booking at a venue apart from creating on vteam', () => {
    expect(CREATE_MENU.map(s => [s.key, s.title])).toEqual([
      ['venue', 'Book at a venue'],
      ['vteam', 'Create on vteam'],
    ])
  })

  it('lists the options with their routes; only creating on vteam needs an account', () => {
    expect(CREATE_MENU.flatMap(s => s.options.map(o => [o.label, o.path, o.requiresAuth]))).toEqual([
      ['Book a court', '/book', false],
      ['Open Play', '/host?maxAttendees=18', true],
      ['Tournament', '/tournament/create', true],
      ['From Template', '/host?mode=templates', true],
    ])
  })
})
