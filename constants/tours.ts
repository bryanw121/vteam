import type { TourDef, TourId } from '../types'

/**
 * Guided tours: an ordered list of steps, each pointing at a target that a
 * `<TourTarget id>` registers somewhere in the UI. Start one with
 * `useTour().start('intro')`. A step whose target isn't on screen (a surface
 * that doesn't render it) is skipped, so the same tour works on the mobile tab
 * bar and the desktop sidebar as long as both register the same ids.
 */
export const TOUR_TARGETS = {
  feedFilters: 'events-filters',
  calendar: 'events-calendar',
  create: 'create-button',
  tab: (key: string) => `tab-${key}`,
} as const

export const TOURS = {
  intro: {
    id: 'intro',
    steps: [
      {
        target: TOUR_TARGETS.feedFilters,
        tab: 'events',
        title: 'Find a game',
        body: 'The Events feed lists sessions near you. Only want to play indoor? Select the Indoor filter.',
      },
      {
        target: TOUR_TARGETS.calendar,
        tab: 'events',
        title: 'Pick a day',
        body: 'Tap a day on the calendar to jump to what is happening then.',
      },
      {
        target: TOUR_TARGETS.create,
        tab: 'events',
        title: 'Host or book',
        body: 'Use + to create an event or book a court.',
      },
      {
        target: TOUR_TARGETS.tab('clubs'),
        title: 'Clubs',
        body: 'Join clubs to keep up with the groups you play with.',
      },
      {
        target: TOUR_TARGETS.tab('chat'),
        title: 'Chat',
        body: 'Message other players and your event groups here.',
      },
      {
        target: TOUR_TARGETS.tab('profile'),
        title: 'Your profile',
        body: 'Set your home city and position in your profile so we can show sessions near you.',
      },
    ],
  },
} satisfies Record<TourId, TourDef>

/** Storage id recorded (device + account, alongside seen banners) when someone finishes a tour. */
export function tourCompletionId(id: TourId): string {
  return `tour-${id}-done`
}
