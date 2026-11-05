import { Text } from '../ui/Text'
import { shared } from '../../constants'

type Props = {
  /** What the person is agreeing by doing, e.g. "continuing or creating an account". */
  action: string
  onOpenTerms: () => void
  onOpenPrivacy: () => void
}

/**
 * Passive clickwrap under the sign-up / sign-in buttons: tapping the button is
 * the agreement. Links open the policy pages; navigation is the caller's.
 */
export function AgreementLine({ action, onOpenTerms, onOpenPrivacy }: Props) {
  return (
    <Text style={shared.agreementLine} testID="agreement-line">
      By {action}, you agree to our{' '}
      <Text style={shared.agreementLink} onPress={onOpenTerms} accessibilityRole="link" testID="agreement-terms">
        Terms and Conditions
      </Text>{' '}
      and{' '}
      <Text style={shared.agreementLink} onPress={onOpenPrivacy} accessibilityRole="link" testID="agreement-privacy">
        Privacy Policy
      </Text>
      .
    </Text>
  )
}
