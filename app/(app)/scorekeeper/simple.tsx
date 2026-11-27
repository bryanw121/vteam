import { Redirect } from 'expo-router'
import { routes } from '../../../utils/routes'

/** Older links: Simple score is now the Simple tab of the Scorekeeper home. */
export default function SimpleScoreRedirect() {
  return <Redirect href={routes.scorekeeper({ mode: 'simple' })} />
}
