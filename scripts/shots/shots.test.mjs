// node --test scripts/shots/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb, parseSelect } from './lib/postgrest.mjs'
import { parseRelationships } from './lib/schema.mjs'
import { affectedScreens, globToRegExp } from './affected.mjs'
import { DEFAULT_SCREENS, SCREENS } from './screens.mjs'
import { buildFixtures, VIEWS } from './fixtures/index.mjs'

const SCHEMA = `
      events: {
        Row: {
          id: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          id: string
        }
        Relationships: []
      }
      event_attendees: {
        Row: {
          id: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
`

function db() {
  return createDb({
    relationships: parseRelationships(SCHEMA),
    tables: {
      profiles: [{ id: 'u1', username: 'maya' }, { id: 'u2', username: 'jo' }],
      events: [
        { id: 'e1', title: 'Sand', created_by: 'u1', event_date: '2026-10-30T21:00:00', cancelled_at: null, price: 0 },
        { id: 'e2', title: 'Indoor', created_by: 'u2', event_date: '2026-11-02T01:30:00', cancelled_at: null, price: 5 },
        { id: 'e3', title: 'Gone', created_by: 'u2', event_date: '2026-10-31T00:00:00', cancelled_at: '2026-10-29T00:00:00Z', price: 5 },
      ],
      event_attendees: [
        { event_id: 'e1', user_id: 'u1', status: 'attending' },
        { event_id: 'e1', user_id: 'u2', status: 'waitlisted' },
        { event_id: 'e2', user_id: 'u2', status: 'attending' },
      ],
    },
    views: { event_attendees_attending: rowsOf => rowsOf('event_attendees').filter(r => r.status === 'attending') },
  })
}

test('parseRelationships keeps each FK on its own table, empty lists included', () => {
  const rels = parseRelationships(SCHEMA)
  assert.deepEqual(rels.map(r => `${r.table}.${r.columns[0]}->${r.refTable}`), [
    'events.created_by->profiles', 'event_attendees.event_id->events', 'event_attendees.user_id->profiles',
  ])
})

test('parseSelect handles aliases, hints, inner joins and counts', () => {
  const items = parseSelect('id, host:profiles!events_created_by_fkey!inner(id, username), event_attendees(count), data->>kind')
  assert.equal(items[1].key, 'host')
  assert.equal(items[1].hint, 'events_created_by_fkey')
  assert.equal(items[1].inner, true)
  assert.equal(items[2].children[0].col, 'count')
  assert.equal(items[3].key, 'kind')
})

test('filters, timestamp comparison, order and embeds', () => {
  const { rows } = db().query('events', new URLSearchParams([
    ['select', 'id, title, profiles!events_created_by_fkey(username), event_attendees_attending(count), mine:event_attendees(user_id, status)'],
    ['event_date', 'gte.2026-10-30T00:00:00.000Z'], ['cancelled_at', 'is.null'], ['order', 'event_date.desc'], ['mine.user_id', 'eq.u1'],
  ]))
  assert.deepEqual(rows.map(r => r.id), ['e2', 'e1'])
  assert.equal(rows[1].profiles.username, 'maya')
  assert.deepEqual(rows[1].event_attendees_attending, [{ count: 1 }])
  assert.deepEqual(rows[1].mine, [{ user_id: 'u1', status: 'attending' }])
  assert.deepEqual(rows[0].mine, [])
})

test('!inner embed filters parents; or= and in.; limit/offset; total for counts', () => {
  const d = db()
  const inner = d.query('events', new URLSearchParams([['select', 'id, event_attendees!inner(user_id)'], ['event_attendees.user_id', 'eq.u2']]))
  assert.deepEqual(inner.rows.map(r => r.id), ['e1', 'e2'])
  const or = d.query('events', new URLSearchParams([['select', 'id'], ['or', '(price.eq.0,title.ilike.*gone*)']]))
  assert.deepEqual(or.rows.map(r => r.id), ['e1', 'e3'])
  const paged = d.query('events', new URLSearchParams([['select', 'id'], ['id', 'in.(e1,e2,e3)'], ['order', 'id.asc'], ['limit', '1'], ['offset', '1']]))
  assert.deepEqual(paged.rows.map(r => r.id), ['e2'])
  assert.equal(paged.total, 3)
})

test('writes change what later reads see; unknown tables are empty', () => {
  const d = db()
  const ins = d.write('POST', 'event_attendees', new URLSearchParams([['select', 'user_id, status']]), { event_id: 'e2', user_id: 'u1', status: 'attending' }, 'return=representation')
  assert.deepEqual(ins.rows, [{ user_id: 'u1', status: 'attending' }])
  d.write('PATCH', 'events', new URLSearchParams([['id', 'eq.e1']]), { title: 'Sand 2' }, '')
  d.write('DELETE', 'events', new URLSearchParams([['id', 'eq.e3']]), null, '')
  const { rows } = d.query('events', new URLSearchParams([['select', 'id, title, event_attendees_attending(count)'], ['order', 'id']]))
  assert.deepEqual(rows, [{ id: 'e1', title: 'Sand 2', event_attendees_attending: [{ count: 1 }] }, { id: 'e2', title: 'Indoor', event_attendees_attending: [{ count: 2 }] }])
  assert.deepEqual(d.query('brand_new_table', new URLSearchParams()).rows, [])
})

test('fixtures: every upcoming event is after now and the world is consistent', () => {
  const now = new Date('2026-10-29T15:00:00Z')
  const f = buildFixtures(now)
  const ids = new Set(f.profiles.map(p => p.id))
  for (const a of f.event_attendees) assert.ok(ids.has(a.user_id), `attendee ${a.user_id} has a profile`)
  const eventIds = new Set(f.events.map(e => e.id))
  for (const a of f.event_attendees) assert.ok(eventIds.has(a.event_id))
  assert.ok(f.tournaments.some(t => new Date(t.start_date) > now))
  const d = createDb({ tables: f, views: VIEWS })
  assert.ok(d.rowsOf('event_attendees_attending').length > 0)
})

test('globs: route brackets and parentheses are literal', () => {
  assert.ok(globToRegExp('app/(app)/event/**').test('app/(app)/event/[id].tsx'))
  assert.ok(globToRegExp('app/(app)/club/[id].tsx').test('app/(app)/club/[id].tsx'))
  assert.ok(!globToRegExp('app/(app)/club/[id].tsx').test('app/(app)/club/i.tsx'))
  assert.ok(globToRegExp('**/*.md').test('README.md'))
  assert.ok(globToRegExp('utils/feed*.ts').test('utils/feedItems.ts'))
})

test('affected: specific files pick their screens, shared files the defaults, tests nothing', () => {
  assert.deepEqual(affectedScreens(['app/(app)/(tabs)/settings/display.tsx']), ['settings-display'])
  assert.ok(affectedScreens(['components/tournament/ResultsTab.tsx']).includes('tournament-results'))
  assert.deepEqual(affectedScreens(['__tests__/x.test.ts', 'supabase/migrations/1_x.sql', 'docs/a.md']), [])
  const shared = affectedScreens(['constants/theme.ts'])
  for (const s of DEFAULT_SCREENS) assert.ok(shared.includes(s))
  assert.ok(affectedScreens(['components/SomethingNew.tsx']).includes('events-feed'))
  for (const s of DEFAULT_SCREENS) assert.ok(SCREENS[s], `default screen ${s} exists`)
})
