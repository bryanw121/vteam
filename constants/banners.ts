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
    body: 'Games around Austin, Dallas and Houston: tap the city above the feed to switch. New to vteam?',
    action: { label: 'Check out our tour', type: 'startTour', tourId: 'intro' },
  },
} satisfies Record<string, BannerDef>

/** Region shown when nothing says where the viewer is (see constants/feedRegions.ts). */
export { DEFAULT_FEED_REGION } from './feedRegions'
