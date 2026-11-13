import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * Ref-counted Supabase Realtime channel registry. See
 * docs/architecture-redesign.md ("Realtime contract").
 *
 * Why: `supabase.channel(name)` returns the *existing* channel when the name is
 * already taken, so two components that both open `conversations-list` share
 * one channel — and whichever unmounts first calls `removeChannel` and kills
 * the other's subscription. Here every topic has exactly one owner (this
 * registry) and a subscriber count.
 *
 * Rules:
 * - One channel per `topic`. The FIRST subscriber's bindings define it; they
 *   are all attached before `.subscribe()`. Later subscribers to the same topic
 *   must pass the same bindings (same event/schema/table/filter, in any order;
 *   handlers may differ). A mismatch logs an error in dev and the extra
 *   bindings never fire — use a different topic for a different binding set.
 * - Every subscriber's handlers are called for each matching change, and the
 *   latest handler from each render is used (no stale closures, no resubscribe
 *   when handlers change identity).
 * - The channel is removed when its last subscriber unmounts.
 * - On `CHANNEL_ERROR` / `TIMED_OUT` the channel is torn down and recreated
 *   with backoff (1s, 2s, 4s… max 30s). On AppState → `active`, any channel
 *   that isn't joined is recreated immediately. After every successful join
 *   except the first, each subscriber's `onReconnect` runs so it can refetch
 *   what it missed while disconnected.
 * - The wire channel name is `<topic>#<n>` (n increments per recreation) so a
 *   recreated channel never collides with the one still leaving, or with
 *   unmigrated code calling `supabase.channel(topic)` directly.
 */

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

export type RealtimeBinding = {
  event: RealtimeEvent
  /** Default `public`. */
  schema?: string
  table: string
  filter?: string
  // Payload shape varies per table; callers narrow `payload.new` / `payload.old`.
  handler: (payload: any) => void
}

export type RealtimeOptions = {
  /** `false` = don't subscribe. Default true. */
  enabled?: boolean
  /** Called after a rejoin (not the first join): refetch whatever may have been missed. */
  onReconnect?: () => void
}

export type ChannelStatus = 'joining' | 'joined' | 'errored' | 'closed'

export type ChannelState = {
  status: ChannelStatus
  subscribers: number
  /** Successful joins so far (1 = initial join, >1 = reconnected). */
  joins: number
  /** Consecutive failed attempts (drives the backoff). */
  retryAttempt: number
  /** Wire name of the current channel instance. */
  channelName: string | null
}

type Subscriber = {
  bindings: { current: RealtimeBinding[] }
  onReconnect: { current: (() => void) | undefined }
}

type TopicEntry = {
  topic: string
  /** Sorted binding signatures; fixed by the first subscriber. */
  signature: string
  bindingSigs: string[]
  /** Canonical (handler-less) bindings used to (re)create the channel. */
  specs: Array<Omit<RealtimeBinding, 'handler'>>
  subscribers: Set<Subscriber>
  channel: RealtimeChannel | null
  channelName: string | null
  /** Incremented per channel instance; callbacks from older instances are ignored. */
  generation: number
  status: ChannelStatus
  joins: number
  retryAttempt: number
  retryTimer: ReturnType<typeof setTimeout> | null
}

const BACKOFF_BASE_MS = 1_000
const BACKOFF_MAX_MS = 30_000

const topics = new Map<string, TopicEntry>()
let appStateSub: NativeEventSubscription | null = null
let lastAppState: AppStateStatus = (AppState.currentState ?? 'active') as AppStateStatus

function bindingSig(b: Omit<RealtimeBinding, 'handler'>): string {
  return [b.event, b.schema ?? 'public', b.table, b.filter ?? ''].join('|')
}

function signatureOf(bindings: RealtimeBinding[]): string {
  return bindings.map(bindingSig).sort().join('\n')
}

function dispatch(entry: TopicEntry, sig: string, payload: unknown): void {
  Array.from(entry.subscribers).forEach(sub => {
    sub.bindings.current.forEach(b => {
      if (bindingSig(b) !== sig) return
      try {
        b.handler(payload)
      } catch (e) {
        // One broken handler must not starve the other subscribers.
        console.error(`[realtime] handler for ${entry.topic} (${sig}) threw`, e)
      }
    })
  })
}

function teardownChannel(entry: TopicEntry): void {
  if (entry.retryTimer) {
    clearTimeout(entry.retryTimer)
    entry.retryTimer = null
  }
  const old = entry.channel
  entry.channel = null
  entry.channelName = null
  entry.generation++
  if (old) void supabase.removeChannel(old)
}

/**
 * Wire names must never repeat within a session: `supabase.channel(name)` hands
 * back an existing channel with that name, and a removed channel stays in the
 * client's list until the server acknowledges the leave. A per-topic counter
 * restarts at 0 for a recreated entry, so the counter is module-wide.
 */
let wireSeq = 0

function openChannel(entry: TopicEntry): void {
  teardownChannel(entry)
  const generation = entry.generation
  const name = `${entry.topic}#${++wireSeq}`
  let channel = supabase.channel(name)
  entry.specs.forEach((spec, i) => {
    const sig = entry.bindingSigs[i]
    const filter: { event: RealtimeEvent; schema: string; table: string; filter?: string } = {
      event: spec.event,
      schema: spec.schema ?? 'public',
      table: spec.table,
    }
    if (spec.filter) filter.filter = spec.filter
    channel = channel.on(
      // The overloads key off a literal event type; the union is fine at runtime.
      'postgres_changes' as never,
      filter as never,
      ((payload: unknown) => {
        if (entry.generation === generation) dispatch(entry, sig, payload)
      }) as never,
    )
  })
  entry.channel = channel
  entry.channelName = name
  entry.status = 'joining'
  channel.subscribe(status => {
    if (entry.generation !== generation || topics.get(entry.topic) !== entry) return
    if (status === 'SUBSCRIBED') {
      entry.status = 'joined'
      entry.retryAttempt = 0
      entry.joins++
      if (entry.joins > 1) {
        Array.from(entry.subscribers).forEach(sub => {
          try {
            sub.onReconnect.current?.()
          } catch (e) {
            console.error(`[realtime] onReconnect for ${entry.topic} threw`, e)
          }
        })
      }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      entry.status = 'errored'
      scheduleRetry(entry)
    } else if (status === 'CLOSED') {
      // Closed by the server/socket, not by us (our teardown bumps generation first).
      // Recovered on the next AppState → active.
      entry.status = 'closed'
    }
  })
}

function scheduleRetry(entry: TopicEntry): void {
  if (entry.retryTimer) return
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** entry.retryAttempt, BACKOFF_MAX_MS)
  entry.retryAttempt++
  entry.retryTimer = setTimeout(() => {
    entry.retryTimer = null
    if (topics.get(entry.topic) === entry) openChannel(entry)
  }, delay)
}

function onAppStateChange(next: AppStateStatus): void {
  const wasBackground = lastAppState !== 'active'
  lastAppState = next
  if (next !== 'active' || !wasBackground) return
  topics.forEach(entry => {
    if (entry.status === 'joined') return
    entry.retryAttempt = 0
    openChannel(entry)
  })
}

function ensureAppStateListener(): void {
  if (appStateSub) return
  lastAppState = (AppState.currentState ?? 'active') as AppStateStatus
  appStateSub = AppState.addEventListener('change', onAppStateChange)
}

function acquire(topic: string, sub: Subscriber): () => void {
  let entry = topics.get(topic)
  const signature = signatureOf(sub.bindings.current)
  if (!entry) {
    const specs = sub.bindings.current.map(({ event, schema, table, filter }) => ({ event, schema, table, filter }))
    entry = {
      topic,
      signature,
      bindingSigs: specs.map(bindingSig),
      specs,
      subscribers: new Set([sub]),
      channel: null,
      channelName: null,
      generation: 0,
      status: 'joining',
      joins: 0,
      retryAttempt: 0,
      retryTimer: null,
    }
    topics.set(topic, entry)
    ensureAppStateListener()
    openChannel(entry)
  } else {
    if (__DEV__ && entry.signature !== signature) {
      console.error(
        `[realtime] topic "${topic}" is already open with different bindings. ` +
          'Subscribers sharing a topic must pass identical bindings; use a distinct topic instead.',
        { existing: entry.signature, requested: signature },
      )
    }
    entry.subscribers.add(sub)
  }

  const owned = entry
  return () => {
    owned.subscribers.delete(sub)
    if (owned.subscribers.size > 0 || topics.get(topic) !== owned) return
    topics.delete(topic)
    teardownChannel(owned)
    if (topics.size === 0 && appStateSub) {
      appStateSub.remove()
      appStateSub = null
    }
  }
}

/**
 * Subscribe to Postgres changes on a shared, ref-counted channel.
 * `topic === null` or `enabled: false` = not subscribed. Changing the topic,
 * `enabled`, or the binding set (event/schema/table/filter) resubscribes;
 * changing only handlers or `onReconnect` does not.
 */
export function useRealtimeChannel(
  topic: string | null,
  bindings: RealtimeBinding[],
  opts?: RealtimeOptions,
): void {
  const enabled = opts?.enabled ?? true
  const bindingsRef = useRef(bindings)
  bindingsRef.current = bindings
  const onReconnectRef = useRef(opts?.onReconnect)
  onReconnectRef.current = opts?.onReconnect
  const signature = signatureOf(bindings)

  useEffect(() => {
    if (topic === null || !enabled) return
    return acquire(topic, { bindings: bindingsRef, onReconnect: onReconnectRef })
  }, [topic, enabled, signature])
}

/** Diagnostics: the registry's view of `topic`, or null if nothing is subscribed. */
export function getChannelState(topic: string): ChannelState | null {
  const entry = topics.get(topic)
  if (!entry) return null
  return {
    status: entry.status,
    subscribers: entry.subscribers.size,
    joins: entry.joins,
    retryAttempt: entry.retryAttempt,
    channelName: entry.channelName,
  }
}

/** Test-only: tear down every channel, timer and the AppState listener. */
export function __resetRealtime(): void {
  topics.forEach(entry => teardownChannel(entry))
  topics.clear()
  if (appStateSub) {
    appStateSub.remove()
    appStateSub = null
  }
  lastAppState = (AppState.currentState ?? 'active') as AppStateStatus
}
