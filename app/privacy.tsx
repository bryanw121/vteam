import { useRouter } from 'expo-router'
import { LegalScreen } from '../components/legal/LegalScreen'
import { PRIVACY_MARKDOWN } from '../constants/legal'
import { routes } from '../utils/routes'

/** Public: guests, store reviewers and the sign-up form link here. */
export default function PrivacyScreen() {
  const router = useRouter()
  return (
    <LegalScreen
      title="Privacy"
      markdown={PRIVACY_MARKDOWN}
      onBack={() => (router.canGoBack() ? router.back() : router.replace(routes.events()))}
    />
  )
}
