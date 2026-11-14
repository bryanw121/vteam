import { Platform } from 'react-native'
import * as Sentry from '@sentry/react-native'
import { sentryEnvironment } from '../utils/sentryEnvironment'

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN
const APP_ENV = sentryEnvironment(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_APP_ENV)
const isWeb = Platform.OS === 'web'

export function initSentry() {
  if (!DSN) return

  try {
    Sentry.init({
      dsn: DSN,
      environment: APP_ENV,

      // Proxy through our own domain so ad blockers don't intercept Sentry requests
      tunnel: isWeb ? '/api/tunnel' : undefined,

      // Sample all traces in beta; 20% in production to stay within free tier
      tracesSampleRate: APP_ENV === 'beta' ? 1.0 : 0.2,

      // Native-only performance features — skip on web to avoid silent init failure
      enableAppStartTracking: !isWeb,
      enableNativeFramesTracking: !isWeb,
      enableStallTracking: !isWeb,

      integrations: isWeb
        ? [] // reactNativeTracingIntegration is native-only; fetch tracing not needed on web
        : [
            Sentry.reactNativeTracingIntegration({
              traceFetch: true,
              traceXHR: true,
            }),
          ],

      debug: __DEV__,
    })

    if (__DEV__) {
      console.log(`[Sentry] initialized — env: ${APP_ENV}, dsn prefix: ${DSN?.slice(0, 30)}`)
      Sentry.captureMessage('Sentry init test')
    }
  } catch (e) {
    // Never let Sentry init crash the app
    console.warn('[Sentry] init failed:', e)
  }
}

export { Sentry }
