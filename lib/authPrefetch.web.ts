import { preloadWhenIdle } from '../components/LazyChunk'

let started = false

/**
 * The sign-in and sign-up screens are lazy route chunks on web, so the first tap
 * on Sign in used to show an empty page while they downloaded. Wherever a guest
 * can tap Sign in (header button, the Chat / Profile prompt), fetch them once the
 * browser is idle: the same chunks the router loads, so the tap renders at once.
 */
export function preloadAuthScreens(): void {
  if (started) return
  started = true
  preloadWhenIdle(() => Promise.all([
    import('../app/(auth)/_layout'),
    import('../app/(auth)/login'),
    import('../app/(auth)/register'),
  ]), 1500)
}
