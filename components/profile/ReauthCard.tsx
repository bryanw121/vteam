import { useState } from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Button } from '../Button'
import { Input } from '../Input'
import { shared, theme } from '../../constants'

type Props = {
  email: string | null
  onPassword: (password: string) => Promise<string | null>
  onSendCode: () => Promise<string | null>
  onVerifyCode: (code: string) => Promise<string | null>
}

/**
 * "Confirm it's you" before deleting an account: the password, or a one-time
 * code emailed to the account (the route for Google sign-ins). Each callback
 * resolves to an error message, or null on success.
 */
export function ReauthCard({ email, onPassword, onSendCode, onVerifyCode }: Props) {
  const [mode, setMode] = useState<'password' | 'code'>('password')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<string | null>) {
    setBusy(true)
    setError(null)
    try {
      setError(await fn())
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={[shared.card, { gap: theme.spacing.sm }]} testID="reauth-card">
      <View style={[shared.row, { gap: theme.spacing.sm }]}>
        <Ionicons name="lock-closed-outline" size={20} color={theme.colors.primary} />
        <Text style={shared.subheading}>Confirm it's you</Text>
      </View>
      <Text style={shared.caption}>
        For your security, sign in again before deleting your account{email ? ` (${email})` : ''}.
      </Text>

      {mode === 'password' ? (
        <>
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            showPasswordToggle
            autoCapitalize="none"
            placeholder="••••••••"
            testID="reauth-password"
          />
          <Button label="Confirm" onPress={() => void run(() => onPassword(password))} loading={busy} disabled={!password || busy} />
          <TouchableOpacity style={shared.authLink} onPress={() => { setMode('code'); setError(null) }} accessibilityRole="button">
            <Text style={shared.authLinkText}>Signed in with Google? Email me a code</Text>
          </TouchableOpacity>
        </>
      ) : !codeSent ? (
        <>
          <Button
            label="Email me a code"
            onPress={() => void run(async () => {
              const err = await onSendCode()
              if (!err) setCodeSent(true)
              return err
            })}
            loading={busy}
            disabled={busy}
          />
          <TouchableOpacity style={shared.authLink} onPress={() => { setMode('password'); setError(null) }} accessibilityRole="button">
            <Text style={shared.authLinkText}>Use my password instead</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Input
            label="6-digit code"
            value={code}
            onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoCapitalize="none"
            placeholder="123456"
            testID="reauth-code"
          />
          <Button label="Confirm" onPress={() => void run(() => onVerifyCode(code))} loading={busy} disabled={code.length < 6 || busy} />
        </>
      )}
      {!!error && <Text style={[shared.caption, { color: theme.colors.error }]}>{error}</Text>}
    </View>
  )
}
