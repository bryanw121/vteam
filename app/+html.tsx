import { ScrollViewStyleReset } from 'expo-router/html'
import { theme } from '../constants/theme'
import { APP_NAME } from '../constants/copy'

// Read at build time (static export inlines EXPO_PUBLIC_*). Empty in tests.
const SUPABASE_ORIGIN = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')

/** Family names match theme.font.* (the names expo-font registers on native). */
const WEB_FONT_FACES = `@font-face { font-family: 'Inter_400Regular'; src: url('/fonts/inter-latin-400-normal.woff2') format('woff2'); font-display: swap; }\n@font-face { font-family: 'Inter_500Medium'; src: url('/fonts/inter-latin-500-normal.woff2') format('woff2'); font-display: swap; }\n@font-face { font-family: 'Inter_600SemiBold'; src: url('/fonts/inter-latin-600-normal.woff2') format('woff2'); font-display: swap; }\n@font-face { font-family: 'Inter_700Bold'; src: url('/fonts/inter-latin-700-normal.woff2') format('woff2'); font-display: swap; }\n@font-face { font-family: 'SpaceGrotesk_400Regular'; src: url('/fonts/space-grotesk-latin-400-normal.woff2') format('woff2'); font-display: swap; }\n@font-face { font-family: 'SpaceGrotesk_500Medium'; src: url('/fonts/space-grotesk-latin-500-normal.woff2') format('woff2'); font-display: swap; }\n@font-face { font-family: 'SpaceGrotesk_600SemiBold'; src: url('/fonts/space-grotesk-latin-600-normal.woff2') format('woff2'); font-display: swap; }\n@font-face { font-family: 'SpaceGrotesk_700Bold'; src: url('/fonts/space-grotesk-latin-700-normal.woff2') format('woff2'); font-display: swap; }`

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/*
          viewport-fit=cover: extends layout under notch/home bar so safe-area-inset-* env vars populate on iOS.
          Pinch zoom stays allowed (WCAG 1.4.4, #136): no maximum-scale / user-scalable=no.
          Double-tap zoom is off through touch-action: manipulation (below), and
          inputs are at least 16px, so iOS doesn't zoom on focus either.
        */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"
        />
        {/* Tint browser chrome (iOS status bar area, Chrome toolbar) to match the app background */}
        <meta name="theme-color" content={theme.colors.background} />
        {/* Dark browser UI (scrollbars, form controls, chrome fallbacks) */}
        <meta name="color-scheme" content="dark" />
        {/* PWA / Add to Home Screen */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={APP_NAME} />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <ScrollViewStyleReset />
        {/*
          Start the Supabase connection (DNS + TLS) while the app bundle downloads,
          so the first feed queries don't pay for it after the app boots.
        */}
        {SUPABASE_ORIGIN ? <link rel="preconnect" href={SUPABASE_ORIGIN} crossOrigin="anonymous" /> : null}
        {SUPABASE_ORIGIN ? <link rel="dns-prefetch" href={SUPABASE_ORIGIN} /> : null}
        {/*
          Web fonts: small self-hosted latin woff2 files (public/fonts, SIL OFL)
          registered under the same family names the native app loads with
          expo-font (theme.font.*). font-display: swap, so text paints at once in
          a fallback face and the root layout doesn't wait on fonts on web.
        */}
        <link rel="preload" href="/fonts/inter-latin-400-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/space-grotesk-latin-700-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* @ts-ignore */}
        <style dangerouslySetInnerHTML={{ __html: WEB_FONT_FACES }} />
        {/* @ts-ignore */}
        <style dangerouslySetInnerHTML={{ __html: `
          /*
            Prevent iOS Safari from zooming in when an input/select is focused.
            iOS zooms if font-size < 16px; max() ensures it's always at least 16px.
          */
          input, select, textarea { font-size: max(16px, 1em); }

          /*
            Prevent Chrome/Android's native pull-to-refresh gesture from
            interfering with the app's own scroll views.
          */
          body { overscroll-behavior-y: contain; }

          /*
            Suppress double-tap-to-zoom everywhere (pinch zoom still works).
            On the root as well as HTML controls: RN Web pressables are divs,
            and the viewport no longer blocks zoom outright (#136).
          */
          html, body, #root, button, a, input, select, textarea, label { touch-action: manipulation; }

          /*
            ── Document-scroll mode (mobile web, Events tab) ──
            When body.doc-scroll is set (see hooks/useDocScrollMode.ts), the page
            content flows in the document and the BODY scrolls, so Safari/Chrome
            collapse their URL bars on scroll. Overrides ScrollViewStyleReset's
            height:100% + overflow:hidden pin. React Navigation's absolute-
            positioned screen wrappers don't clip (overflow: visible), so their
            overflowing content makes the body scrollable.
          */
          body.doc-scroll { height: auto !important; overflow: auto !important; }
          body.doc-scroll #root { height: auto !important; min-height: 100dvh; }
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
