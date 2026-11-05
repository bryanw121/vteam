/**
 * Test doubles for the handler tests (`<name>/handler.test.ts`, run by
 * `deno task test`). Nothing here touches the network or real secrets.
 *
 *   const db = fakeSupabase({ results: { 'push_tokens.select': { data: [{ token: 't1' }] } } })
 *   const net = stubFetch([{ url: EXPO_PUSH_URL, respond: () => Response.json({ data: [...] }) }])
 *   const handler = createHandler(testDeps({ db, net, env: { SUPABASE_SERVICE_ROLE_KEY: 'k' } }))
 *
 * Keep the fake in step with how the handlers call supabase-js (the DbClient
 * slice in deps.ts): every stage returns the same builder, and awaiting it
 * resolves the scripted result for that table and operation.
 */

import type { AuthUser, DbClient, DbError, DbQuery, DbResult, Deps } from './deps.ts'

export type Op = 'select' | 'insert' | 'delete'

/** One `from(table)...` chain, as the handler built it. */
export type DbCall = {
  table: string
  op: Op
  columns?: string
  options?: { count?: 'exact'; head?: boolean }
  /** insert() payload. */
  values?: unknown
  /** eq / neq / in / lt / gte / limit, in call order. */
  filters: [string, ...unknown[]][]
  single: boolean
}

export type ScriptedResult = Partial<DbResult> | ((call: DbCall) => Partial<DbResult>)

export type FakeSupabaseOptions = {
  /** Keyed `<table>.<op>`, e.g. 'push_tokens.select'. Unscripted: no rows, no error. */
  results?: Record<string, ScriptedResult>
  /** What auth.getUser(jwt) returns: a user, or null for an invalid token. */
  user?: AuthUser | null | ((jwt: string) => AuthUser | null)
}

export type FakeSupabase = DbClient & {
  calls: DbCall[]
  /** Calls to one table, optionally one operation. */
  callsTo(table: string, op?: Op): DbCall[]
  /** Tokens auth.getUser was asked about. */
  jwts: string[]
}

export function fakeSupabase(opts: FakeSupabaseOptions = {}): FakeSupabase {
  const calls: DbCall[] = []
  const jwts: string[] = []

  const resolve = (call: DbCall): DbResult => {
    const scripted = opts.results?.[`${call.table}.${call.op}`]
    const r = typeof scripted === 'function' ? scripted(call) : scripted ?? {}
    const fallback = call.op === 'select' && !call.single ? [] : null
    return { data: r.data === undefined ? fallback : r.data, error: r.error ?? null, count: r.count ?? null }
  }

  const builder = (call: DbCall): DbQuery => {
    const filter = (name: string) => (...args: unknown[]) => {
      call.filters.push([name, ...args])
      return q
    }
    const q: DbQuery = {
      select(columns, options) {
        // insert(...).select() would keep op 'insert'; the handlers don't do that.
        if (call.op === 'select') {
          call.columns = columns
          call.options = options
        }
        return q
      },
      insert(values) {
        call.op = 'insert'
        call.values = values
        return q
      },
      delete() {
        call.op = 'delete'
        return q
      },
      eq: filter('eq'),
      neq: filter('neq'),
      in: filter('in'),
      lt: filter('lt'),
      gte: filter('gte'),
      limit: filter('limit'),
      maybeSingle() {
        call.single = true
        return Promise.resolve(resolve(call))
      },
      then(onFulfilled, onRejected) {
        return Promise.resolve(resolve(call)).then(onFulfilled, onRejected)
      },
    }
    return q
  }

  return {
    calls,
    jwts,
    callsTo: (table, op) => calls.filter((c) => c.table === table && (!op || c.op === op)),
    from(table) {
      const call: DbCall = { table, op: 'select', filters: [], single: false }
      calls.push(call)
      return builder(call)
    },
    auth: {
      getUser(jwt) {
        jwts.push(jwt)
        const user = typeof opts.user === 'function' ? opts.user(jwt) : opts.user ?? null
        const error: DbError | null = user ? null : { message: 'invalid JWT' }
        return Promise.resolve({ data: { user }, error })
      },
    },
  }
}

/** The value of one filter on a recorded call, e.g. filterValue(call, 'in') for `.in('token', [...])`. */
export function filterValue(call: DbCall, name: string): unknown {
  return call.filters.find(([n]) => n === name)?.slice(2)[0]
}

export type FetchCall = { url: string; init?: RequestInit; body: unknown }

export type FetchRoute = {
  /** Exact URL, or a URL prefix ending in '?' / '/', or a predicate. */
  url: string | ((url: string) => boolean)
  /** Return a Response, or throw to simulate a network failure. */
  respond: (call: FetchCall, index: number) => Response | Promise<Response>
}

export type StubFetch = Deps['fetch'] & { calls: FetchCall[]; callsTo(url: string): FetchCall[] }

/** A fetch that answers only the scripted routes and throws on any other URL. */
export function stubFetch(routes: FetchRoute[] = []): StubFetch {
  const calls: FetchCall[] = []
  const counts = new Map<FetchRoute, number>()
  const matches = (route: FetchRoute, url: string) =>
    typeof route.url === 'function'
      ? route.url(url)
      : route.url === url || (/[?/]$/.test(route.url) && url.startsWith(route.url))

  const fn = async (input: string, init?: RequestInit) => {
    const url = String(input)
    const route = routes.find((r) => matches(r, url))
    if (!route) throw new Error(`stubFetch: unscripted request to ${url}`)
    let body: unknown = init?.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch { /* keep the raw string */ }
    }
    const call = { url, init, body }
    calls.push(call)
    const n = counts.get(route) ?? 0
    counts.set(route, n + 1)
    return await route.respond(call, n)
  }
  return Object.assign(fn, {
    calls,
    callsTo: (url: string) => calls.filter((c) => c.url === url || c.url.startsWith(url)),
  })
}

export const SERVICE_KEY = 'test-service-role-key'
export const WEBHOOK_SECRET = 'test-webhook-secret'
/** A fixed clock: 2026-11-04T12:00:00Z. */
export const NOW = Date.UTC(2026, 10, 4, 12, 0, 0)

/** Deps for a handler under test. `db: null` makes getClient throw, like missing secrets. */
export function testDeps(opts: {
  db?: DbClient | null
  net?: Deps['fetch']
  env?: Record<string, string | undefined>
  now?: number
} = {}): Deps {
  const env = { SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, WEBHOOK_SECRET, ...opts.env }
  return {
    fetch: opts.net ?? stubFetch(),
    getClient: () => {
      if (opts.db === null) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set')
      return opts.db ?? fakeSupabase()
    },
    env: (name) => env[name as keyof typeof env],
    now: () => opts.now ?? NOW,
  }
}

/** A POST with a JSON body (or a raw string) and the service-role bearer unless headers say otherwise. */
export function webhookRequest(body: unknown, headers: Record<string, string> = { Authorization: `Bearer ${SERVICE_KEY}` }, method = 'POST'): Request {
  return new Request('https://fn.test/', {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: method === 'GET' || method === 'HEAD' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
}

/** Silences console output from the handler for the duration of fn, returning what was logged. */
export async function quietly<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const logs: string[] = []
  const saved = { log: console.log, warn: console.warn, error: console.error }
  const capture = (...args: unknown[]) => void logs.push(args.map(String).join(' '))
  console.log = capture
  console.warn = capture
  console.error = capture
  try {
    return { result: await fn(), logs }
  } finally {
    Object.assign(console, saved)
  }
}
