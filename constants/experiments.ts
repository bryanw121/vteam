import type { Experiment } from '../types'
import { routes } from '../utils/routes'

/** Settings → Experimental features. Add a card here; remove it when the experiment ends. */
export const EXPERIMENTS: readonly Experiment[] = [
  {
    id: 'scorekeeper',
    title: 'Scorekeeper',
    body: 'Keep the official score by tapping. Rotations, subs and time-outs are tracked for you, and you get a finished USA Volleyball scoresheet.',
    icon: 'clipboard-outline',
    href: routes.scorekeeper(),
  },
]
