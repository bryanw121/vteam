import { useLocalSearchParams } from 'expo-router'
import { TournamentWizard } from '../../../../components/tournament/create/TournamentWizard'

/** The host edits a tournament (#402): the same wizard, seeded from the saved one. */
export default function TournamentEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <TournamentWizard editId={typeof id === 'string' ? id : null} />
}
