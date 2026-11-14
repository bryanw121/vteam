import type * as SentrySdk from '@sentry/react-native'
import { sentryEnvironment } from '../utils/sentryEnvironment'

/**
 * Web: Sentry loads after first paint, in its own chunk, instead of riding in
 * the main bundle (the SDK, with its browser and replay packages, is several
 * hundred KB the first screen doesn't need). Native keeps `lib/sentry.ts`.
 *
 * `Sentry` here is a small stand-in with the calls the app makes. Until the SDK
 * has loaded they are queued (bounded), and replayed once it is initialized;
 * errors thrown before then are caught by a temporary window listener and
 * queued the same way. Without a DSN nothing loads and every call is a no-op.
 */

type Sdk = typeof SentrySdk

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN
const APP_ENV = sentryEnvironment(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_APP_ENV)
/** Calls kept while the SDK loads; beyond this the oldest are dropped. */
const MAX_QUEUED = 50
/** Load once the browser is idle after first paint, but never later than this. */
const LOAD_TIMEOUT_MS = 3000

/** Its own chunk: Metro splits dynamic imports into separate files on web. */
let importSdk = (): Promise<Sdk> => import('@sentry/react-native')
let sdk: Sdk | null = null
let enabled = false
let queue: Array<(s: Sdk) => void> = []

function call(fn: (s: Sdk) => void): void {
  if (sdk) {
    fn(sdk)
    return
  }
  if (!enabled) return
  queue.push(fn)
  if (queue.length > MAX_QUEUED) queue.shift()
}

function onEarlyError(e: ErrorEvent): void {
  const error = e.error instanceof Error ? e.error : new Error(e.message)
  call(s => s.captureException(error))
}

function onEarlyRejection(e: PromiseRejectionEvent): void {
  const reason = e.reason
  call(s => s.captureException(reason instanceof Error ? reason : new Error(String(reason))))
}

async function load(): Promise<void> {
  try {
    const s = await importSdk()
    s.init({
      dsn: DSN,
      environment: APP_ENV,
      // Proxy through our own domain so ad blockers don't intercept Sentry requests
      tunnel: '/api/tunnel',
      // Sample all traces in beta; 20% in production to stay within free tier
      tracesSampleRate: APP_ENV === 'beta' ? 1.0 : 0.2,
      // Native-only performance features: off on web to avoid silent init failure
      enableAppStartTracking: false,
      enableNativeFramesTracking: false,
      enableStallTracking: false,
      // reactNativeTracingIntegration is native-only; fetch tracing not needed on web
      integrations: [],
      debug: __DEV__,
    })
    // The SDK's own global handlers take over from here.
    window.removeEventListener('error', onEarlyError)
    window.removeEventListener('unhandledrejection', onEarlyRejection)
    sdk = s
    const pending = queue
    queue = []
    pending.forEach(fn => fn(s))
  } catch (e) {
    // Never let Sentry crash the app; stop queueing.
    enabled = false
    queue = []
    console.warn('[Sentry] load failed:', e)
  }
}

export function initSentry(): void {
  // No DSN, or the static render (no window): stay a no-op.
  if (!DSN || enabled || typeof window === 'undefined') return
  enabled = true
  window.addEventListener('error', onEarlyError)
  window.addEventListener('unhandledrejection', onEarlyRejection)
  const start = () => { void load() }
  const whenIdle = () => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(start, { timeout: LOAD_TIMEOUT_MS })
    } else {
      setTimeout(start, 1)
    }
  }
  if (document.readyState === 'complete') whenIdle()
  else window.addEventListener('load', whenIdle, { once: true })
}

type CaptureContext = Parameters<Sdk['captureException']>[1]

export const Sentry = {
  captureException(error: unknown, hint?: CaptureContext): void {
    call(s => { s.captureException(error, hint) })
  },
  captureMessage(message: string): void {
    call(s => { s.captureMessage(message) })
  },
  addBreadcrumb(breadcrumb: Parameters<Sdk['addBreadcrumb']>[0]): void {
    call(s => s.addBreadcrumb(breadcrumb))
  },
  setUser(user: Parameters<Sdk['setUser']>[0]): void {
    call(s => s.setUser(user))
  },
  /** Native wraps the root for touch breadcrumbs and profiling; on web the root renders as is (render errors go through SentryErrorBoundary). */
  wrap<C>(component: C): C {
    return component
  },
}

/** Test-only (Jest can't run the dynamic import). */
export function __setSdkImporter(fn: () => Promise<Sdk>): void {
  importSdk = fn
}
