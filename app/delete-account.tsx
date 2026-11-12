import { useRouter } from 'expo-router'
import { LegalScreen } from '../components/legal/LegalScreen'
import { DELETE_ACCOUNT_MARKDOWN } from '../constants/legal'
import { routes } from '../utils/routes'

/** Public: the account-deletion URL for Google Play's listing. Explains in-app and email deletion. */
export default function DeleteAccountInfoScreen() {
  const router = useRouter()
  return (
    <LegalScreen
      title="Delete account"
      markdown={DELETE_ACCOUNT_MARKDOWN}
      onBack={() => (router.canGoBack() ? router.back() : router.replace(routes.events()))}
    />
  )
}
