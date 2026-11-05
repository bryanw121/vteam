import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'

/**
 * Module-level query cache: `useQuery` for reads, `useMutation` for writes,
 * `invalidate` to tell readers a write happened.
 *
 * Hand-rolled because CLAUDE.md forbids third-party state management; the API
 * mirrors TanStack Query on purpose so a later swap is mechanical. See
 * docs/architecture-redesign.md ("Data layer contract").
 *
 * - The cache is a `Map` at module scope, so it survives unmount and tab
 *   switches. Entries are never garbage-collected (the app's working set is
 *   small); `removeQueries` drops them explicitly (e.g. on sign-out).
 * - Keys are strings built with `queryKey('event', id)` → `event:<id>`.
 *   Prefix matching (`invalidate`, `removeQueries`) is segment-aware:
 *   `invalidate('event:1')` hits `event:1` and `event:1:comments`, never `event:10`.
 * - One fetch per key at a time; concurrent callers share the in-flight promise.
 * - A failed fetch keeps the last good `data` and sets `error`.
 */

export const DEFAULT_STALE_MS = 60_000

const SEP = ':'

export type QueryOptions = {
  /** How long a successful fetch counts as fresh. Default `DEFAULT_STALE_MS`. */
  staleMs?: number
  /** `false` = idle: reads whatever is cached, never fetches. Default true. */
  enabled?: boolean
  /** While a new key has no data yet, keep returning the previous key's data. */
  keepPreviousData?: boolean
}

export type RefetchOptions = {
  /** Fetch even if fresh, superseding any in-flight fetch. For explicit user actions (pull-to-refresh). */
  force?: boolean
}

export type QueryResult<T> = {
  data: T | undefined
  error: Error | null
  /** No data to show yet and a fetch is pending. Goes false once data or an error arrives. */
  isLoading: boolean
  isFetching: boolean
  /** Invalidated, never fetched, or older than `staleMs`. Evaluated at render time. */
  isStale: boolean
  /**
   * Without `force`: fetch only if stale (otherwise resolves to the cached data),
   * joining an in-flight fetch. With `force`: always start a new fetch.
   * Resolves to `undefined` on error or when idle — it never rejects.
   */
  refetch: (opts?: RefetchOptions) => Promise<T | undefined>
}

export type MutationOptions<TVars, TResult> = {
  /** Runs before `fn`. Apply optimistic `setQueryData` here; return a rollback to undo it on error. */
  onMutate?: (vars: TVars) => void | (() => void)
  onSuccess?: (result: TResult, vars: TVars) => void
  onError?: (error: Error, vars: TVars) => void
  /** Prefixes passed to `invalidate` after success. */
  invalidates?: string[] | ((vars: TVars, result: TResult) => string[])
}

export type MutationResult<TVars, TResult> = {
  /**
   * Resolves to the result, or `undefined` if `fn` threw (error is set and
   * `onMutate`'s rollback has run) or a mutation was already pending
   * (double-submit guard). Never rejects — callers show their own Alert.
   */
  mutate: (vars: TVars) => Promise<TResult | undefined>
  isPending: boolean
  error: Error | null
}

/** What `useSyncExternalStore` reads. Replaced (never mutated) whenever the entry changes. */
type Snapshot = {
  data: unknown
  hasData: boolean
  error: Error | null
  isFetching: boolean
  fetchedAt: number
  invalidated: boolean
}

type Fetcher = () => Promise<unknown>

type Entry = {
  data: unknown
  hasData: boolean
  error: Error | null
  /** ms epoch of the last successful fetch (or setQueryData); 0 = never. */
  fetchedAt: number
  staleMs: number
  invalidated: boolean
  promise: Promise<unknown> | null
  /** Incremented per fetch / setQueryData; a fetch only writes if it's still the latest. */
  fetchId: number
  /** `useSyncExternalStore` listeners: every mounted reader, enabled or not. */
  subscribers: Set<() => void>
  /** Enabled, mounted `useQuery` instances → their latest fetcher. Non-empty = "active". */
  activeFetchers: Map<object, { current: Fetcher }>
  snapshot: Snapshot
}

const cache = new Map<string, Entry>()
const globalListeners = new Set<(key: string) => void>()

const EMPTY_SNAPSHOT: Snapshot = {
  data: undefined,
  hasData: false,
  error: null,
  isFetching: false,
  fetchedAt: 0,
  invalidated: false,
}

/** Build a cache key. `null`/`undefined` become `_`; `:` and `%` inside parts are escaped. */
export function queryKey(...parts: (string | number | null | undefined)[]): string {
  return parts
    .map(p => (p === null || p === undefined ? '_' : String(p).replace(/%/g, '%25').replace(/:/g, '%3A')))
    .join(SEP)
}

function matchesPrefix(key: string, prefix: string): boolean {
  return key === prefix || key.startsWith(prefix + SEP)
}

function getEntry(key: string): Entry {
  let entry = cache.get(key)
  if (!entry) {
    entry = {
      data: undefined,
      hasData: false,
      error: null,
      fetchedAt: 0,
      staleMs: DEFAULT_STALE_MS,
      invalidated: false,
      promise: null,
      fetchId: 0,
      subscribers: new Set(),
      activeFetchers: new Map(),
      snapshot: EMPTY_SNAPSHOT,
    }
    cache.set(key, entry)
  }
  return entry
}

/** Rebuild the snapshot and tell every reader of `key`. */
function notify(key: string, entry: Entry): void {
  entry.snapshot = {
    data: entry.data,
    hasData: entry.hasData,
    error: entry.error,
    isFetching: entry.promise !== null,
    fetchedAt: entry.fetchedAt,
    invalidated: entry.invalidated,
  }
  // Copy before iterating: a listener may unsubscribe during the callback.
  Array.from(entry.subscribers).forEach(l => l())
  Array.from(globalListeners).forEach(l => l(key))
}

/** Listen to every cache change (any key). Used by the event feed and diagnostics. */
export function subscribeQueryCache(listener: (key: string) => void): () => void {
  globalListeners.add(listener)
  return () => {
    globalListeners.delete(listener)
  }
}

function isEntryStale(entry: Entry, staleMs: number, now: number): boolean {
  return entry.invalidated || entry.fetchedAt === 0 || now - entry.fetchedAt >= staleMs
}

function toError(e: unknown): Error {
  if (e instanceof Error) return e
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    // Supabase/PostgREST errors are plain objects with a message.
    return Object.assign(new Error((e as { message: string }).message), { cause: e })
  }
  return new Error(String(e))
}

/** Start (or join) a fetch for `key`. Resolves to the data, or `undefined` on error. Never rejects. */
function runFetch<T>(key: string, fetcher: () => Promise<T>, force: boolean): Promise<T | undefined> {
  const entry = getEntry(key)
  if (entry.promise && !force) return entry.promise as Promise<T | undefined>

  const id = ++entry.fetchId
  const promise: Promise<T | undefined> = (async () => {
    try {
      const data = await fetcher()
      if (entry.fetchId === id && cache.get(key) === entry) {
        entry.data = data
        entry.hasData = true
        entry.error = null
        entry.fetchedAt = Date.now()
        entry.invalidated = false
        entry.promise = null
        notify(key, entry)
      }
      return data
    } catch (e) {
      const error = toError(e)
      if (entry.fetchId === id && cache.get(key) === entry) {
        entry.error = error
        entry.promise = null
        notify(key, entry)
      }
      return undefined
    }
  })()
  entry.promise = promise
  notify(key, entry)
  return promise
}

/** Any enabled mounted reader's fetcher (they share a key, so they fetch the same thing). */
function activeFetcher(entry: Entry): Fetcher | null {
  let last: Fetcher | null = null
  entry.activeFetchers.forEach(ref => {
    last = ref.current
  })
  return last
}

/**
 * Mark every key under `prefix` stale. Keys with an enabled mounted reader are
 * refetched now (unless `refetchActive: false`); the rest refetch when next read.
 */
export function invalidate(prefix: string, opts?: { refetchActive?: boolean }): void {
  const refetchActive = opts?.refetchActive ?? true
  cache.forEach((entry, key) => {
    if (!matchesPrefix(key, prefix)) return
    entry.invalidated = true
    const fetcher = refetchActive ? activeFetcher(entry) : null
    if (fetcher) {
      // Forced: an in-flight fetch may have started before the write and would return the old row.
      void runFetch(key, fetcher, true)
    } else {
      // No reader to refetch for: still retire any fetch already in flight, so a
      // pre-write response landing later can't clear the stale flag.
      entry.fetchId++
      entry.promise = null
      notify(key, entry)
    }
  })
}

/**
 * Write `key`'s data directly (optimistic update, or seeding a detail entry
 * from a list row). Counts as fresh, and supersedes any in-flight fetch for the
 * key so a response that left before the write can't clobber it.
 */
export function setQueryData<T>(key: string, updater: T | ((prev: T | undefined) => T)): void {
  const entry = getEntry(key)
  const next =
    typeof updater === 'function'
      ? (updater as (prev: T | undefined) => T)(entry.data as T | undefined)
      : updater
  entry.fetchId++
  entry.promise = null
  entry.data = next
  entry.hasData = true
  entry.error = null
  entry.fetchedAt = Date.now()
  entry.invalidated = false
  notify(key, entry)
}

/**
 * Warm `key` before anything reads it (prefetch on intent: press-in, hover).
 * Fetches only if there is no fresh data and no fetch in flight; the screen's
 * `useQuery` on the same key then joins the request or reads the result.
 * Fire-and-forget: never rejects.
 */
export function prefetchQuery<T>(key: string, fetcher: () => Promise<T>, opts?: { staleMs?: number }): Promise<void> {
  const entry = getEntry(key)
  const staleMs = opts?.staleMs ?? entry.staleMs
  if (entry.promise || (entry.hasData && !isEntryStale(entry, staleMs, Date.now()))) return Promise.resolve()
  return runFetch(key, fetcher, false).then(() => undefined)
}

export function getQueryData<T>(key: string): T | undefined {
  return cache.get(key)?.data as T | undefined
}

/**
 * Drop every key under `prefix` (e.g. user-scoped data on sign-out). Entries
 * with mounted readers are reset to empty in place — readers see no data, and
 * do not refetch on their own; call `invalidate` afterwards if they should.
 */
export function removeQueries(prefix: string): void {
  Array.from(cache.entries()).forEach(([key, entry]) => {
    if (!matchesPrefix(key, prefix)) return
    entry.fetchId++
    entry.promise = null
    if (entry.subscribers.size === 0 && entry.activeFetchers.size === 0) {
      cache.delete(key)
      return
    }
    entry.data = undefined
    entry.hasData = false
    entry.error = null
    entry.fetchedAt = 0
    entry.invalidated = false
    notify(key, entry)
  })
}

/** Test-only: drop every entry and listener. */
export function __resetQueryCache(): void {
  cache.clear()
  globalListeners.clear()
}

export function useQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts?: QueryOptions,
): QueryResult<T> {
  const enabled = (opts?.enabled ?? true) && key !== null
  const staleMs = opts?.staleMs ?? DEFAULT_STALE_MS
  const keepPreviousData = opts?.keepPreviousData ?? false

  const fetcherRef = useRef<Fetcher>(fetcher)
  fetcherRef.current = fetcher
  const staleMsRef = useRef(staleMs)
  staleMsRef.current = staleMs

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (key === null) return () => {}
      const entry = getEntry(key)
      entry.subscribers.add(onChange)
      return () => {
        entry.subscribers.delete(onChange)
      }
    },
    [key],
  )
  const getSnapshot = useCallback(
    () => (key === null ? EMPTY_SNAPSHOT : cache.get(key)?.snapshot ?? EMPTY_SNAPSHOT),
    [key],
  )
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // Register as an active reader (invalidate refetches through us) and fetch if needed.
  useEffect(() => {
    if (!enabled || key === null) return
    const entry = getEntry(key)
    const token = {}
    entry.activeFetchers.set(token, fetcherRef)
    entry.staleMs = staleMsRef.current
    if (!entry.hasData || isEntryStale(entry, staleMsRef.current, Date.now())) {
      void runFetch(key, () => fetcherRef.current(), false)
    }
    return () => {
      entry.activeFetchers.delete(token)
    }
  }, [key, enabled])

  // keepPreviousData: remember the last data we rendered, per hook instance.
  const previousRef = useRef<{ data: unknown } | null>(null)
  if (snap.hasData) previousRef.current = { data: snap.data }
  const showPrevious = keepPreviousData && !snap.hasData && previousRef.current !== null

  const refetch = useCallback(
    (refetchOpts?: RefetchOptions): Promise<T | undefined> => {
      if (!enabled || key === null) return Promise.resolve(undefined)
      const entry = getEntry(key)
      if (!refetchOpts?.force && entry.hasData && !isEntryStale(entry, staleMsRef.current, Date.now()) && !entry.promise) {
        return Promise.resolve(entry.data as T)
      }
      return runFetch(key, () => fetcherRef.current() as Promise<T>, refetchOpts?.force ?? false)
    },
    [key, enabled],
  )

  const hasData = snap.hasData || showPrevious
  return {
    data: (snap.hasData ? snap.data : showPrevious ? previousRef.current?.data : undefined) as T | undefined,
    error: snap.error,
    isLoading: enabled && !hasData && (snap.isFetching || snap.error === null),
    isFetching: snap.isFetching,
    isStale:
      snap.invalidated || snap.fetchedAt === 0 || Date.now() - snap.fetchedAt >= staleMs,
    refetch,
  }
}

export function useMutation<TVars, TResult>(
  fn: (vars: TVars) => Promise<TResult>,
  opts?: MutationOptions<TVars, TResult>,
): MutationResult<TVars, TResult> {
  const [state, setState] = useState<{ isPending: boolean; error: Error | null }>({
    isPending: false,
    error: null,
  })
  const pendingRef = useRef(false)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const optsRef = useRef(opts)
  optsRef.current = opts

  const mutate = useCallback(async (vars: TVars): Promise<TResult | undefined> => {
    if (pendingRef.current) return undefined
    pendingRef.current = true
    setState({ isPending: true, error: null })

    const invalidateAll = (result?: TResult) => {
      const inv = optsRef.current?.invalidates
      let prefixes: string[] = []
      try {
        prefixes = typeof inv === 'function' ? (result === undefined ? [] : inv(vars, result)) : inv ?? []
      } catch (e) {
        console.error('[useMutation] invalidates threw', e)
      }
      prefixes.forEach(p => invalidate(p))
    }
    const safely = (label: string, cb?: () => void) => {
      try {
        cb?.()
      } catch (e) {
        console.error(`[useMutation] ${label} threw`, e)
      }
    }

    let rollback: (() => void) | undefined
    let result: TResult
    try {
      const r = optsRef.current?.onMutate?.(vars)
      if (typeof r === 'function') rollback = r
      result = await fnRef.current(vars)
    } catch (e) {
      const error = toError(e)
      safely('rollback', rollback)
      // The rollback restores a snapshot via setQueryData, which marks it fresh
      // and cancels in-flight fetches; refetch so newer server state wins.
      if (typeof optsRef.current?.invalidates !== 'function') invalidateAll()
      pendingRef.current = false
      setState({ isPending: false, error })
      safely('onError', () => optsRef.current?.onError?.(error, vars))
      return undefined
    }

    pendingRef.current = false
    setState({ isPending: false, error: null })
    invalidateAll(result)
    safely('onSuccess', () => optsRef.current?.onSuccess?.(result, vars))
    return result
  }, [])

  return { mutate, isPending: state.isPending, error: state.error }
}

/** Refetch `key` if it is stale and has an enabled reader. */
function refetchIfStale(key: string): void {
  const entry = cache.get(key)
  if (!entry) return
  const fetcher = activeFetcher(entry)
  if (!fetcher) return
  if (entry.hasData && !isEntryStale(entry, entry.staleMs, Date.now())) return
  void runFetch(key, fetcher, false)
}

/**
 * Refetch `key` when the screen regains focus or the app returns to the
 * foreground — only if stale (invalidated or older than its `staleMs`).
 * Pair with a `useQuery` on the same key; it supplies the fetcher.
 */
export function useFocusRefetch(key: string | null): void {
  useFocusEffect(
    useCallback(() => {
      if (key !== null) refetchIfStale(key)
    }, [key]),
  )
  useForegroundRefetch(key)
}

/**
 * Only the foreground half of `useFocusRefetch`: refetch `key` when the app
 * returns to the foreground, if stale. For providers outside a screen.
 */
export function useForegroundRefetch(key: string | null): void {
  useEffect(() => {
    if (key === null) return
    const sub = AppState.addEventListener('change', status => {
      if (status === 'active') refetchIfStale(key)
    })
    return () => sub.remove()
  }, [key])
}
