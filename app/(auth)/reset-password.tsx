import { useEffect, useRef, useState } from 'react'
import { View, TouchableOpacity } from 'react-native'
import { Text, TextInput } from '../../components/ui/Text'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { recoveryLinkAtStart, supabase } from '../../lib/supabase'
import { sendPasswordReset } from '../../lib/passwordReset'
import { Sentry } from '../../lib/sentry'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { Spinner } from '../../components/ui'
import { shared, theme } from '../../constants'
import { routes } from '../../utils/routes'

/** How long to wait for a reset link to sign in before calling it expired (#223). */
const VERIFY_TIMEOUT_MS = 10_000

type Stage = 'verifying' | 'form' | 'expired' | 'done'

/**
 * Where reset emails land (#223). A good link signs in (the client reads the
 * tokens from the URL) and shows the new-password form; an expired or used one,
 * or a link that never signs in within 10 s, shows the expired state with a
 * resend. Setting the password signs out every other device.
 */
export default function ResetPassword() {
  const router = useRouter()
  const confirmRef = useRef<TextInput>(null)

  const [stage, setStage] = useState<Stage>(recoveryLinkAtStart === 'expired' ? 'expired' : 'verifying')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [resendSent, setResendSent] = useState(false)
  const [resendError, setResendError] = useState<string | null>(null)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    if (stage !== 'verifying') return
    const toForm = () => setStage(s => (s === 'verifying' ? 'form' : s))
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') toForm()
    })
    // The session may already exist (the client signed in before this mounted).
    void supabase.auth.getSession().then(({ data: { session } }) => { if (session) toForm() })
    const timer = setTimeout(() => setStage(s => (s === 'verifying' ? 'expired' : s)), VERIFY_TIMEOUT_MS)
    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [stage])

  async function handleReset() {
    setError(null)
    if (!password) { setError('Enter a new password'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      // Whoever had the old password is signed out everywhere else.
      await supabase.auth.signOut({ scope: 'others' }).catch(() => {})
      setStage('done')
      setTimeout(() => router.replace(routes.app()), 2000)
    } catch (e: unknown) {
      Sentry.captureException(e)
      setError('Could not reset password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (!email.trim()) { setResendError('Enter your email address'); return }
    setResendError(null)
    setResending(true)
    try {
      const failure = await sendPasswordReset(email)
      if (failure) setResendError(failure)
      else setResendSent(true)
    } finally {
      setResending(false)
    }
  }

  const backToSignIn = (
    <TouchableOpacity style={shared.authLink} onPress={() => router.replace(routes.login())} accessibilityRole="link">
      <Text style={shared.authLinkText}>Back to sign in</Text>
    </TouchableOpacity>
  )

  return (
    <LinearGradient
      colors={theme.gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={shared.authBackground}
    >
      <View style={shared.authCard}>
        <Text style={shared.authTitle}>vteam</Text>

        {stage === 'done' ? (
          <>
            <Text style={shared.authSubtitle}>password updated!</Text>
            <Text style={[shared.caption, { textAlign: 'center' }]}>
              You're signed out on your other devices. Taking you back to the app…
            </Text>
          </>
        ) : stage === 'verifying' ? (
          <>
            <Text style={shared.authSubtitle}>checking your link…</Text>
            <Spinner label="Checking your reset link" />
            {backToSignIn}
          </>
        ) : stage === 'expired' ? (
          <View testID="reset-expired" style={{ gap: theme.spacing.sm }}>
            <Text style={shared.authSubtitle}>this link has expired</Text>
            <Text style={[shared.caption, { textAlign: 'center' }]}>
              Reset links work once and expire. Enter your email and we'll send a new one.
            </Text>
            {resendSent ? (
              <Text style={[shared.caption, { textAlign: 'center' }]} testID="reset-resent">
                If that email has an account, a new link is on its way.
              </Text>
            ) : (
              <>
                <Input
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="send"
                  onSubmitEditing={() => void handleResend()}
                  error={resendError ?? undefined}
                  testID="reset-resend-email"
                />
                <Button label="Email a new link" onPress={() => void handleResend()} loading={resending} disabled={!email.trim()} />
              </>
            )}
            {backToSignIn}
          </View>
        ) : (
          <>
            <Text style={shared.authSubtitle}>set a new password</Text>

            <Input
              label="New password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => confirmRef.current?.focus()}
            />
            <Input
              ref={confirmRef}
              label="Confirm password"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
              returnKeyType="go"
              onSubmitEditing={handleReset}
            />

            {error && <Text style={shared.errorText}>{error}</Text>}

            <Button
              label="Update password"
              onPress={handleReset}
              loading={loading}
              disabled={!password || !confirm}
            />

            {backToSignIn}
          </>
        )}
      </View>
    </LinearGradient>
  )
}
