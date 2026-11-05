/**
 * What every edge function handler gets from the outside world, so the
 * handler can run under `deno test` with a fake database and a stubbed
 * network (`_shared/testing.ts`) and in production with the real ones
 * (`defaultDeps` in `_shared/supabase.ts`).
 *
 * Each function is split in two:
 *   <name>/handler.ts  export function createHandler(deps: Deps): (req: Request) => Promise<Response>
 *   <name>/index.ts    Deno.serve(createHandler(defaultDeps))
 *
 * Types only, and no imports from URLs: handler.ts imports this file, and
 * the handler tests must type-check and run with no network.
 */

export type DbError = { message: string }

/** What awaiting a query resolves to (the parts the handlers read). */
export type DbResult = { data: unknown; error: DbError | null; count?: number | null }

/**
 * The slice of a supabase-js query builder the handlers call. One shape for
 * every stage of the chain, which is looser than supabase-js but enough for
 * the handlers and for the fake.
 */
export interface DbQuery extends PromiseLike<DbResult> {
  select(columns?: string, options?: { count?: 'exact'; head?: boolean }): DbQuery
  insert(values: unknown): DbQuery
  delete(): DbQuery
  eq(column: string, value: unknown): DbQuery
  neq(column: string, value: unknown): DbQuery
  in(column: string, values: readonly unknown[]): DbQuery
  lt(column: string, value: unknown): DbQuery
  gte(column: string, value: unknown): DbQuery
  limit(count: number): DbQuery
  maybeSingle(): PromiseLike<DbResult>
}

export type AuthUser = { id: string; email?: string | null }

/** The slice of a supabase-js client the handlers call. */
export interface DbClient {
  from(table: string): DbQuery
  /** A Postgres function through PostgREST (login-with-username: check_rate_limit, get_email_by_username). */
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<DbResult>
  auth: {
    getUser(jwt: string): PromiseLike<{ data: { user: AuthUser | null } | null; error: DbError | null }>
  }
}

export type Deps = {
  /** The network. Tests pass stubFetch(), which throws on any unscripted URL. */
  fetch: (input: string, init?: RequestInit) => Promise<Response>
  /** Service-role client. May throw (missing secrets): handlers turn that into a 500. */
  getClient: () => DbClient
  /** Read a secret / env var; undefined when unset. */
  env: (name: string) => string | undefined
  /** Milliseconds since the epoch, as Date.now(). */
  now: () => number
}
