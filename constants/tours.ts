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
  scoreCards: 'score-cards',
  scoreServer: 'score-server',
  scorePoints: 'score-points',
  scoreActions: 'score-actions',
  scoreCourt: 'score-court',
  scoreMore: 'score-more',
  sheetForm: 'sheet-form',
  sheetCopy: 'sheet-copy',
  sheetPdf: 'sheet-pdf',
  sheetStart: 'sheet-start',
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
  /** The live match screen (app/(app)/scorekeeper/[id]); opens the first time someone scores a set, and from its ? button. */
  scorekeeper: {
    id: 'scorekeeper',
    steps: [
      {
        target: TOUR_TARGETS.scorePoints,
        title: 'Tap who won the rally',
        body: "That's most of the job. Rotations, servers and side-outs update by themselves.",
      },
      {
        target: TOUR_TARGETS.scoreCards,
        title: 'The score',
        body: 'Points, time-outs and subs for each team. The serving team is outlined.',
      },
      {
        target: TOUR_TARGETS.scoreServer,
        title: 'Who serves next',
        body: 'Check it against the court before each serve. Tap it if someone served out of turn.',
      },
      {
        target: TOUR_TARGETS.scoreActions,
        title: 'Everything else',
        body: 'Record subs, liberos, time-outs and cards here. Undo fixes a wrong tap.',
      },
      {
        target: TOUR_TARGETS.scoreCourt,
        title: 'Who stands where',
        body: 'The rotation right now, server in position I. Tap a player to sub them.',
        placement: 'top',
      },
      {
        target: TOUR_TARGETS.scoreMore,
        title: 'Fix things and finish',
        body: 'Fix a past rally, match the scoreboard or add a remark. The scoresheet is here too.',
      },
    ],
  },
  /** The example match's scoresheet (app/(app)/scorekeeper/[id]/sheet); opens every time someone opens the example. */
  scorekeeperExample: {
    id: 'scorekeeperExample',
    steps: [
      {
        target: TOUR_TARGETS.sheetForm,
        title: 'This is what you get',
        body: 'The official USA Volleyball scoresheet, filled in for you. You only tapped who won each rally.',
      },
      {
        target: TOUR_TARGETS.sheetCopy,
        title: 'Copy it onto paper',
        body: 'After the match, this shows one part of the form at a time and what to write in it.',
      },
      {
        target: TOUR_TARGETS.sheetPdf,
        title: 'Or print it',
        body: 'Download the filled-in form to print, or to send to the tournament desk.',
      },
      {
        target: TOUR_TARGETS.sheetStart,
        title: 'Try it yourself',
        body: 'Enter both lineups, then tap who wins each rally. A short tour shows you the buttons.',
      },
    ],
  },
} satisfies Record<TourId, TourDef>

/** Storage id recorded (device + account, alongside seen banners) when someone finishes a tour. */
export function tourCompletionId(id: TourId): string {
  return `tour-${id}-done`
}
