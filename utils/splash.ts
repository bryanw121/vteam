/**
 * How long the loading screen stays at least: one full bounce of the ball (drop,
 * squash, back up: the 1.1 s cycle in splashCss.ts / AppSplashContent.tsx) and the
 * wordmark landing, so a fast start doesn't flash the splash on and off before
 * anyone can see what it was. Loading runs underneath the whole time, so a slow
 * start isn't made any slower.
 */
export const SPLASH_MIN_MS = 1150
/** The splash fades out over this long once it may go. */
export const SPLASH_FADE_MS = 250

/** ms still to wait before fading out, given how long the splash has been up. No wait with reduced motion: nothing moves. */
export function splashHoldMs(elapsedMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0
  return Math.max(0, Math.round(SPLASH_MIN_MS - elapsedMs))
}
