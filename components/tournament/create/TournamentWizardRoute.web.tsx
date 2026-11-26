import React from 'react'
import { lazyChunk } from '../../LazyChunk'
import { ScreenState } from '../../ui'
import type { TournamentWizardProps } from '../../../types'

/**
 * Web: the tournament wizard is its own chunk. Both /tournament/create and
 * /tournament/edit/<id> use it, and Metro puts a module two route chunks share
 * into `__common`, which every first visit downloads (41 KB over the startup
 * budget). Loaded only when one of those screens opens.
 */
export const TournamentWizardRoute = lazyChunk<TournamentWizardProps>(
  () => import('./TournamentWizard').then(m => ({ default: m.TournamentWizard })),
  <ScreenState loading />,
)
