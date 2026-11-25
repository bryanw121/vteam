import type { Experiment } from '../types'
import { routes } from '../utils/routes'

/** Settings → Experiments. Add a card here; remove it when the experiment ends. */
export const EXPERIMENTS: readonly Experiment[] = [
  {
    id: 'scorekeeper',
    title: 'Scorekeeper',
    body: 'Keep the official score by tapping: rotations, subs and time-outs are tracked, and you get a finished USA Volleyball scoresheet. Or use Simple score to just count points and sets.',
    icon: 'clipboard-outline',
    href: routes.scorekeeper(),
  },
]
