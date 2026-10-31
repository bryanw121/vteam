/**
 * Answers every Supabase request a page makes, from fixtures, with Playwright
 * `page.route` (and `routeWebSocket` for Realtime). Nothing reaches the network:
 * requests to any other host are aborted, so a capture is the same every run.
 *
 * - /rest/v1/<table>       fake PostgREST (lib/postgrest.mjs)
 * - /rest/v1/rpc/<fn>      the app's RPCs below; unknown ones answer []
 * - /auth/v1/*             a signed-in user or a signed-out 401
 * - /functions/v1/*        {} (places-proxy gets an empty prediction list)
 * - /storage/v1/*          uploads succeed; object reads get a 1x1 PNG
 * - /realtime/v1/websocket joins succeed, nothing is ever pushed
 */
import { createDb } from './postgrest.mjs'
import { buildFixtures, VIEWS, ME } from '../fixtures/index.mjs'
import { PEOPLE } from '../fixtures/people.mjs'

export const MOCK_SUPABASE_URL = 'https://shotsmock.supabase.co'
export const MOCK_ANON_KEY = 'shots-mock-anon-key'
/** supabase-js: `sb-<first label of the host>-auth-token`, kept in localStorage on web (AsyncStorage). */
export const AUTH_STORAGE_KEY = `sb-${new URL(MOCK_SUPABASE_URL).hostname.split('.')[0]}-auth-token`

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64')

function b64url(o) { return Buffer.from(JSON.stringify(o)).toString('base64url') }

export function fakeSession(now) {
  const me = PEOPLE.find(p => p.id === ME)
  const exp = Math.floor(now.getTime() / 1000) + 3600 * 24 * 365
  const user = {
    id: ME, aud: 'authenticated', role: 'authenticated', email: `${me.username}@example.com`, email_confirmed_at: new Date(now.getTime() - 864e5 * 200).toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { username: me.username }, identities: [],
    created_at: new Date(now.getTime() - 864e5 * 200).toISOString(), updated_at: now.toISOString(),
  }
  const access_token = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: ME, role: 'authenticated', aud: 'authenticated', exp, email: user.email })}.c2hvdHM`
  return { access_token, refresh_token: 'shots-refresh-token', token_type: 'bearer', expires_in: exp - Math.floor(now.getTime() / 1000), expires_at: exp, user }
}

const FEED_EVENT_SELECT = 'id, created_by, club_id, title, location, event_date, duration_minutes, max_attendees, created_at, price, requires_approval, surface, profiles!events_created_by_fkey(id, username, first_name, last_name, avatar_url), event_attendees_attending(count), event_guests_attending(count), event_attendees_waitlisted(count), event_tags(tag_id, tags(id, name, category, display_order)), clubs(id, name, avatar_url)'
const FEED_TOURNAMENT_SELECT = 'id, created_by, club_id, title, location, start_date, max_teams, price, skill_levels, status, created_at, profiles!tournaments_created_by_fkey(id, username, first_name, last_name, avatar_url), clubs(id, name, avatar_url)'
const FEED_EXTERNAL_SELECT = 'id, source_id, region, title, venue, city, surface, session_type, level, price, starts_at, ends_at, signup_url, signup_label, note, verified_at'

function rpcHandlers(db, signedIn) {
  const profile = id => db.rowsOf('profiles').find(p => p.id === id) ?? {}
  const previews = eventIds => {
    const set = new Set(eventIds)
    const byEvent = new Map()
    for (const a of db.rowsOf('event_attendees').filter(a => a.status === 'attending' && set.has(a.event_id)).sort((x, y) => (x.joined_at < y.joined_at ? -1 : 1))) {
      const list = byEvent.get(a.event_id) ?? []
      if (list.length < 3) list.push(a)
      byEvent.set(a.event_id, list)
    }
    return [...byEvent.values()].flat().map(a => {
      const p = profile(a.user_id)
      return { event_id: a.event_id, user_id: a.user_id, username: p.username, first_name: p.first_name, last_name: p.last_name, avatar_url: p.avatar_url }
    })
  }
  const myConversations = () => {
    const mine = db.rowsOf('conversation_members').filter(m => m.user_id === ME)
    return mine.map(m => {
      const conv = db.rowsOf('conversations').find(c => c.id === m.conversation_id)
      const msgs = db.rowsOf('messages').filter(x => x.conversation_id === conv.id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
      const last = msgs[msgs.length - 1]
      const sender = last ? profile(last.sender_id) : {}
      const other = conv.type === 'dm' ? db.rowsOf('conversation_members').find(x => x.conversation_id === conv.id && x.user_id !== ME) : null
      const op = other ? profile(other.user_id) : {}
      const club = conv.club_id ? db.rowsOf('clubs').find(c => c.id === conv.club_id) : null
      return {
        conversation_id: conv.id, type: conv.type, club_id: conv.club_id, created_at: conv.created_at,
        club_name: club?.name ?? null, club_avatar_url: club?.avatar_url ?? null,
        last_message_id: last?.id ?? null, last_message_content: last?.content ?? null, last_message_image_url: last?.image_url ?? null,
        last_message_at: last?.created_at ?? null, last_message_deleted_at: last?.deleted_at ?? null,
        last_sender_id: last?.sender_id ?? null, last_sender_username: sender.username ?? null, last_sender_first_name: sender.first_name ?? null, last_sender_last_name: sender.last_name ?? null,
        my_last_read_at: m.last_read_at,
        other_user_id: other?.user_id ?? null, other_user_username: op.username ?? null, other_user_first_name: op.first_name ?? null,
        other_user_last_name: op.last_name ?? null, other_user_avatar_url: op.avatar_url ?? null, other_user_selected_border: op.selected_border ?? null,
        unread_count: msgs.filter(x => x.sender_id !== ME && (!m.last_read_at || x.created_at > m.last_read_at)).length,
      }
    }).sort((a, b) => ((b.last_message_at ?? b.created_at) > (a.last_message_at ?? a.created_at) ? 1 : -1))
  }
  return {
    get_feed_span: ({ p_start, p_end, p_external_updated_since }) => {
      const events = db.query('events', new URLSearchParams([
        ['select', signedIn ? `${FEED_EVENT_SELECT}, my_attendance:event_attendees(user_id, status)` : FEED_EVENT_SELECT],
        ['event_date', `gte.${p_start}`], ['event_date', `lt.${p_end}`], ['cancelled_at', 'is.null'], ['order', 'event_date.asc'],
        ...(signedIn ? [['my_attendance.user_id', `eq.${ME}`]] : []),
      ])).rows
      const tournaments = db.query('tournaments', new URLSearchParams([
        ['select', FEED_TOURNAMENT_SELECT], ['start_date', `gte.${p_start}`], ['start_date', `lt.${p_end}`],
        ['status', 'not.in.(draft,cancelled)'], ['order', 'start_date.asc'],
      ])).rows
      const external = db.query('external_sessions', new URLSearchParams([
        ['select', FEED_EXTERNAL_SELECT], ['starts_at', `gte.${p_start}`], ['starts_at', `lt.${p_end}`], ['canceled', 'is.false'],
        ...(p_external_updated_since ? [['updated_at', `gte.${p_external_updated_since}`]] : []), ['order', 'starts_at.asc'],
      ])).rows
      return { events, tournaments, external, previews: previews(events.map(e => e.id)) }
    },
    get_event_card_attendee_previews: ({ p_event_ids }) => previews(p_event_ids ?? []),
    get_my_conversations: () => (signedIn ? myConversations() : []),
    get_chat_unread_count: () => (signedIn ? myConversations().reduce((n, c) => n + c.unread_count, 0) : 0),
    find_or_create_dm: ({ other_user_id }) => {
      const dm = myConversations().find(c => c.type === 'dm' && c.other_user_id === other_user_id)
      return dm?.conversation_id ?? null
    },
    get_email_by_username: ({ p_username }) => `${p_username}@example.com`,
    is_club_owner: ({ p_club_id }) => db.rowsOf('club_members').some(m => m.club_id === p_club_id && m.user_id === ME && m.role === 'owner'),
    is_conversation_member: ({ conv_id }) => db.rowsOf('conversation_members').some(m => m.conversation_id === conv_id && m.user_id === ME),
    notification_pref_enabled: () => true,
    mark_conversation_read: () => null,
    mark_notification_read: () => null,
    mark_all_notifications_read: () => null,
  }
}

/**
 * Install the mock on a page. `signedIn` seeds a session into localStorage
 * before any script runs. `seenIds` (banner/tour ids) are marked seen on the
 * device and the account. Returns the in-memory db and a log of unhandled calls.
 */
export async function installSupabaseMock(page, { now, signedIn, seenIds = [], relationships = [], log = null }) {
  const fixtures = buildFixtures(now)
  fixtures.user_settings = fixtures.user_settings.map(s => ({ ...s, seen_banners: [...new Set([...s.seen_banners, ...seenIds])] }))
  const db = createDb({ tables: fixtures, views: VIEWS, relationships })
  const rpc = rpcHandlers(db, signedIn)
  const session = fakeSession(now)
  const misses = new Set()

  await page.addInitScript(({ key, session, seen }) => {
    try {
      if (session) localStorage.setItem(key, JSON.stringify(session))
      else localStorage.removeItem(key)
      localStorage.setItem('vteam.seenBanners', JSON.stringify(seen))
    } catch { /* storage blocked: banners may show */ }
  }, { key: AUTH_STORAGE_KEY, session: signedIn ? session : null, seen: seenIds })

  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, HEAD, OPTIONS',
    'access-control-expose-headers': 'content-range, x-total-count',
  }
  const json = (route, status, body, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { ...cors, ...headers }, body: body === undefined ? '' : JSON.stringify(body) })

  // Everything that is neither the local server nor Supabase: abort (fonts are bundled; maps, Sentry, avatars from elsewhere are not needed).
  await page.route(url => !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url.href) && !url.href.startsWith(MOCK_SUPABASE_URL) && !url.href.startsWith('data:') && !url.href.startsWith('blob:'), route => route.abort())

  await page.route(`${MOCK_SUPABASE_URL}/**`, async route => {
    const req = route.request()
    const method = req.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const url = new URL(req.url())
    const path = url.pathname
    const headers = req.headers()
    const prefer = headers['prefer'] ?? ''
    const parseBody = () => { try { return req.postData() ? JSON.parse(req.postData()) : null } catch { return null } }
    try {
      if (path.startsWith('/rest/v1/rpc/')) {
        const fn = path.slice('/rest/v1/rpc/'.length)
        const args = method === 'GET' ? Object.fromEntries(url.searchParams) : parseBody() ?? {}
        if (!rpc[fn]) { misses.add(`rpc ${fn}`); return json(route, 200, []) }
        return json(route, 200, rpc[fn](args))
      }
      if (path.startsWith('/rest/v1/')) {
        const table = path.slice('/rest/v1/'.length)
        if (!(table in fixtures) && !VIEWS[table]) misses.add(`table ${table}`)
        if (method === 'GET' || method === 'HEAD') {
          const { rows, total, offset } = db.query(table, url.searchParams)
          const range = rows.length ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}`
          const extra = { 'content-range': /count=/.test(prefer) ? range : range.replace(/\/\d+$/, '/*') }
          if (method === 'HEAD') return route.fulfill({ status: 200, headers: { ...cors, ...extra } })
          if ((headers['accept'] ?? '').includes('vnd.pgrst.object')) {
            if (rows.length !== 1) return json(route, 406, { code: 'PGRST116', details: `The result contains ${rows.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' })
            return json(route, 200, rows[0], extra)
          }
          return json(route, 200, rows, extra)
        }
        const { rows } = db.write(method, table, url.searchParams, parseBody(), prefer)
        if (rows === null) return route.fulfill({ status: method === 'POST' ? 201 : 204, headers: cors })
        if ((headers['accept'] ?? '').includes('vnd.pgrst.object')) return json(route, method === 'POST' ? 201 : 200, rows[0] ?? null)
        return json(route, method === 'POST' ? 201 : 200, rows)
      }
      if (path.startsWith('/auth/v1/')) {
        const what = path.slice('/auth/v1/'.length)
        if (what === 'user') return signedIn ? json(route, 200, session.user) : json(route, 401, { code: 401, error_code: 'no_authorization', msg: 'No session' })
        if (what === 'token' || what === 'signup' || what === 'verify') return json(route, 200, session)
        if (what === 'logout') return route.fulfill({ status: 204, headers: cors })
        if (what === 'settings') return json(route, 200, { external: { email: true }, disable_signup: false })
        return json(route, 200, {})
      }
      if (path.startsWith('/functions/v1/')) {
        const fn = path.slice('/functions/v1/'.length)
        if (fn.startsWith('places-proxy')) return json(route, 200, { predictions: [], results: [] })
        return json(route, 200, {})
      }
      if (path.startsWith('/storage/v1/')) {
        if (method === 'GET') return route.fulfill({ status: 200, contentType: 'image/png', headers: cors, body: PNG_1x1 })
        return json(route, 200, { Key: path.replace('/storage/v1/object/', ''), Id: 'shots' })
      }
      misses.add(`other ${path}`)
      return json(route, 200, {})
    } catch (e) {
      misses.add(`error ${method} ${path}: ${e.message}`)
      return json(route, 200, [])
    } finally {
      if (log) log.push(`${method} ${path}${url.search ? '?' + decodeURIComponent(url.search.slice(1)).slice(0, 160) : ''}`)
    }
  })

  // Realtime: accept joins and heartbeats so channels report "subscribed"; never push.
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, ws => {
    ws.onMessage(raw => {
      let m
      try { m = JSON.parse(String(raw)) } catch { return }
      const [joinRef, ref, topic, event, payload] = Array.isArray(m) ? m : [m.join_ref, m.ref, m.topic, m.event, m.payload]
      const reply = response => ws.send(JSON.stringify(Array.isArray(m) ? [joinRef, ref, topic, 'phx_reply', { status: 'ok', response }] : { join_ref: joinRef, ref, topic, event: 'phx_reply', payload: { status: 'ok', response } }))
      if (event === 'phx_join') {
        let n = 1
        const pcs = (payload?.config?.postgres_changes ?? []).map(pc => ({ ...pc, id: n++ }))
        return reply({ postgres_changes: pcs })
      }
      if (ref) reply({})
    })
  })

  return { db, misses }
}
