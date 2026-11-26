import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html'
import { DOCUMENT_BACKGROUND } from '../constants/colorScheme'
import { buildColorSchemeScript } from '../utils/colorSchemeScript'
import { SPLASH_CSS } from '../components/splash/splashCss'
import { APP_NAME } from '../constants/copy'
import { buildFeedPrefetchScript } from '../utils/feedPrefetchScript'

// Read at build time (static export inlines EXPO_PUBLIC_*). Empty in tests.
const SUPABASE_ORIGIN = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

const COLOR_SCHEME_SCRIPT = buildColorSchemeScript()

/** Family names match theme.font.* (the names expo-font registers on native). */
const WEB_FONT_FACES = `@font-face { font-family: 'Outfit_400Regular'; src: url('/fonts/outfit-latin-400-normal.woff2') format('woff2'); font-display: swap; }\n@font-face { font-family: 'Outfit_500Medium'; src: url('/fonts/outfit-latin-500-normal.woff2') format('woff2'); font-display: swap; }\n@font-face { font-family: 'Outfit_600SemiBold'; src: url('/fonts/outfit-latin-600-normal.woff2') format('woff2'); font-display: swap; }\n@font-face { font-family: 'Outfit_700Bold'; src: url('/fonts/outfit-latin-700-normal.woff2') format('woff2'); font-display: swap; }\n@font-face { font-family: 'Outfit_800ExtraBold'; src: url('/fonts/outfit-latin-800-normal.woff2') format('woff2'); font-display: swap; }`

export default function Root({ children }: { children: React.ReactNode }) {
  // Expo Router 58 streams the document: the app's scripts, styles and favicon
  // arrive as head/body nodes that a custom Root must render (#226).
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext()
  return (
    <html lang="en" {...htmlAttributes}>
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
        {/* Tint browser chrome (iOS status bar area, Chrome toolbar) to match the app background; the script below switches it for dark */}
        <meta name="theme-color" content={DOCUMENT_BACKGROUND.light} />
        {/* Browser UI (scrollbars, form controls) follows the scheme set on <html> by the script below */}
        <meta name="color-scheme" content="light dark" />
        {/*
          Light or dark before anything paints (Settings → Display → Appearance): the
          same rule as lib/colorSchemeInit.web.ts, which the app runs first. Without it
          a dark page flashes the light background while the scripts download.
        */}
        <script dangerouslySetInnerHTML={{ __html: COLOR_SCHEME_SCRIPT }} />
        {/* PWA / Add to Home Screen */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={APP_NAME} />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        {/* Web app manifest (#189): installable, which iPhone needs before it allows web push. */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <ScrollViewStyleReset />
        {/*
          Start the Supabase connection (DNS + TLS) while the app bundle downloads,
          so the first feed queries don't pay for it after the app boots.
        */}
        {SUPABASE_ORIGIN ? <link rel="preconnect" href={SUPABASE_ORIGIN} crossOrigin="anonymous" /> : null}
        {SUPABASE_ORIGIN ? <link rel="dns-prefetch" href={SUPABASE_ORIGIN} /> : null}
        {/*
          The app restores scroll itself (utils/scrollMemory, DocScrollView memoryKey). Left on
          'auto', the browser first jumps to its own remembered offset on Back, then the app moves
          it again: a visible flicker. Set before the app loads so the first Back is already right.
        */}
        <script dangerouslySetInnerHTML={{ __html: "try{if('scrollRestoration' in history)history.scrollRestoration='manual'}catch(e){}" }} />
        {/*
          Start the Events feed request now (#184), before the app bundle has
          downloaded: on a cold server the wait overlaps the download. Only on
          `/`; useMonthEvents adopts it if span and viewer match (lib/feedPrefetch.web).
        */}
        {SUPABASE_ORIGIN && SUPABASE_ANON_KEY ? (
          // @ts-ignore
          <script dangerouslySetInnerHTML={{ __html: buildFeedPrefetchScript(SUPABASE_ORIGIN, SUPABASE_ANON_KEY) }} />
        ) : null}
        {/*
          Web fonts: small self-hosted latin woff2 files (public/fonts, SIL OFL)
          registered under the same family names the native app loads with
          expo-font (theme.font.*). font-display: swap, so text paints at once in
          a fallback face and the root layout doesn't wait on fonts on web.
        */}
        {/*
          Every weight the app draws is preloaded (each ~14 KB): a weight fetched only when first
          used swaps in after its text painted, and the new metrics moved the sidebar and lists on
          reload (#387; since #385 all text is Outfit, mostly 500-700).
        */}
        <link rel="preload" href="/fonts/outfit-latin-400-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/outfit-latin-500-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/outfit-latin-600-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/outfit-latin-700-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/outfit-latin-800-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* @ts-ignore */}
        <style dangerouslySetInnerHTML={{ __html: WEB_FONT_FACES }} />
        {/* The loading screen's look (components/splash): it animates before the scripts arrive. */}
        {/* @ts-ignore */}
        <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
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

          html, body { background: ${DOCUMENT_BACKGROUND.light}; color-scheme: light; }
          html[data-theme=dark], html[data-theme=dark] body { background: ${DOCUMENT_BACKGROUND.dark}; color-scheme: dark; }

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
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  )
}
