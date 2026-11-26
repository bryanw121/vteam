import { useLocalSearchParams } from 'expo-router'
import { TournamentWizardRoute } from '../../../../components/tournament/create/TournamentWizardRoute'

/** The host edits a tournament (#402): the same wizard, seeded from the saved one. */
export default function TournamentEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <TournamentWizardRoute editId={typeof id === 'string' ? id : null} />
}
