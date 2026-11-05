import { useEffect, useRef, useState } from 'react'
import { View, TouchableOpacity } from 'react-native'
import { Text, TextInput } from '../../components/ui/Text'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { Sentry } from '../../lib/sentry'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { shared, theme } from '../../constants'
import { routes } from '../../utils/routes'

export default function ResetPassword() {
  const router = useRouter()
  const confirmRef = useRef<TextInput>(null)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  // On web, detectSessionInUrl: true in supabase.ts auto-parses the #access_token
  // from the email link. We just need to wait for the auth state to settle.
  // On native the deep link is handled by Expo Router + Supabase's auth listener.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setSessionReady(true)
      if (event === 'SIGNED_IN') setSessionReady(true)
    })
    // Also check if session already exists (e.g. web page was already loaded with hash)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleReset() {
    setError(null)
    if (!password) { setError('Enter a new password'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setDone(true)
      setTimeout(() => router.replace(routes.app()), 2000)
    } catch (e: any) {
      Sentry.captureException(e)
      setError('Could not reset password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <LinearGradient
      colors={theme.gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={shared.authBackground}
    >
      <View style={shared.authCard}>
        <Text style={shared.authTitle}>vteam</Text>

        {done ? (
          <>
            <Text style={shared.authSubtitle}>password updated!</Text>
            <Text style={[shared.caption, { textAlign: 'center' }]}>Taking you back to the app…</Text>
          </>
        ) : !sessionReady ? (
          <>
            <Text style={shared.authSubtitle}>verifying link…</Text>
            <Text style={[shared.caption, { textAlign: 'center' }]}>
              If this takes too long, try requesting a new reset link.
            </Text>
            <TouchableOpacity style={shared.authLink} onPress={() => router.replace(routes.login())}>
              <Text style={shared.authLinkText}>Back to sign in</Text>
            </TouchableOpacity>
          </>
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

            <TouchableOpacity style={shared.authLink} onPress={() => router.replace(routes.login())}>
              <Text style={shared.authLinkText}>Back to sign in</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </LinearGradient>
  )
}
