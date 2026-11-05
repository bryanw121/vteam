import type { BannerDef } from '../types'

/**
 * One-time banners: information a person needs once, the first time they open
 * a screen. Render one with `<OneTimeBanner banner={BANNERS.x} />`; it shows on
 * the first visit and never again (remembered on the device, and on the account
 * when signed in). To re-announce, give the entry a new `id`.
 */
export const BANNERS = {
  austinPilot: {
    id: 'austin-pilot-v2',
    title: "We're piloting in Austin!",
    body: "Set your home city in your profile and we'll show sessions near you as we add them. New to Vteam?",
    action: { label: 'Check out our tour', type: 'startTour', tourId: 'intro' },
  },
} satisfies Record<string, BannerDef>

/** Region shown to guests and to people who haven't set a home city (Schelagg region slug). */
export const DEFAULT_FEED_REGION = 'austin'
