import { useState, useRef } from 'react'
import { View, TouchableOpacity } from 'react-native'
import { Text, TextInput } from '../../components/ui/Text'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { obfuscateEmail, sendPasswordReset } from '../../lib/passwordReset'
import { signInWithGoogle, sendEmailOtp, verifyEmailOtp } from '../../lib/socialAuth'
import { isUnknownEmailOtpError } from '../../utils/authErrors'
import { signInWithUsername } from '../../lib/usernameAuth'
import { Input } from '../../components/Input'
import { shared } from '../../constants'
import { INCORRECT_EMAIL_OR_PASSWORD } from '../../constants/copy'
import { routes } from '../../utils/routes'
import { AgreementLine } from '../../components/legal/AgreementLine'
import { AuthScreen } from '../../components/auth/AuthScreen'
import { AuthCta, AuthLink, GoogleButton, OrWithEmail } from '../../components/auth/AuthBits'
import { JoinContextCard } from '../../components/auth/JoinContextCard'
import { useUrlParam } from '../../hooks/useUrlParam'
import { VIEW } from '../../utils/urlViews'

export default function Login() {
  const router = useRouter()
  const passwordRef = useRef<TextInput>(null)
  const otpCodeRef = useRef<TextInput>(null)

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({})
  // Forgot password and the emailed-code form are in the URL (`?mode=reset`, `?mode=code`), so other screens can link straight to them.
  const [mode, setMode] = useUrlParam('mode', VIEW.login.mode)
  const forgotMode = mode === 'reset'
  const setForgotMode = (on: boolean) => setMode(on ? 'reset' : null)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')

  // ── OTP (magic code) mode ──────────────────────────────────────────────────
  const otpMode = mode === 'code'
  const setOtpMode = (on: boolean) => setMode(on ? 'code' : null)
  const [otpEmail, setOtpEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpCodeSent, setOtpCodeSent] = useState(false)
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpError, setOtpError] = useState('')

  // ── Social sign-in ─────────────────────────────────────────────────────────
  const [socialLoading, setSocialLoading] = useState(false)
  const [socialError, setSocialError] = useState('')

  async function handleForgotPassword() {
    const email = resetEmail.toLowerCase().trim()
    if (!email) {
      setResetError('Please enter your email address')
      return
    }
    setResetError('')
    setResetLoading(true)
    try {
      const error = await sendPasswordReset(email)
      if (error) {
        setResetError(error)
      } else {
        setResetSent(obfuscateEmail(email))
      }
    } finally {
      setResetLoading(false)
    }
  }

  async function handleLogin() {
    setErrors({})
    setLoading(true)

    try {
      const normalized = identifier.toLowerCase().trim()
      if (!normalized.includes('@')) {
        // Resolved server-side: the account's email never reaches this device,
        // and an unknown username reads the same as a wrong password.
        const message = await signInWithUsername(normalized, password)
        if (message) setErrors({ password: message })
        return
      }

      const { error } = await supabase.auth.signInWithPassword({ email: normalized, password })
      if (error) setErrors({ password: error.status === 429 ? error.message : INCORRECT_EMAIL_OR_PASSWORD })
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    setSocialError('')
    setSocialLoading(true)
    try {
      await signInWithGoogle()
    } catch (e: any) {
      // Ignore user-cancelled errors
      const msg: string = e?.message ?? ''
      if (!msg.includes('cancel') && !msg.includes('dismiss') && !msg.includes('ERR_CANCELED')) {
        setSocialError(msg || 'Sign-in failed. Please try again.')
      }
    } finally {
      setSocialLoading(false)
    }
  }

  async function handleSendOtp() {
    const email = otpEmail.toLowerCase().trim()
    if (!email) { setOtpError('Enter your email address'); return }
    setOtpError('')
    setOtpLoading(true)
    try {
      await sendEmailOtp(email)
      setOtpCodeSent(true)
      setTimeout(() => otpCodeRef.current?.focus(), 200)
    } catch (e: any) {
      if (isUnknownEmailOtpError(e)) {
        // Same screen as a sent code: the error would reveal that no account uses this email.
        setOtpCodeSent(true)
      } else {
        setOtpError(e?.status === 429 ? 'Too many codes requested. Please wait a minute and try again.' : 'Could not send a code. Please try again.')
      }
    } finally {
      setOtpLoading(false)
    }
  }

  async function handleVerifyOtp() {
    const code = otpCode.trim()
    if (!code) { setOtpError('Enter the 6-digit code'); return }
    setOtpError('')
    setOtpLoading(true)
    try {
      await verifyEmailOtp(otpEmail.toLowerCase().trim(), code)
      // Navigation is handled by useAuth / _layout.tsx on SIGNED_IN event
    } catch (e: any) {
      setOtpError(e?.message ?? 'Invalid or expired code')
    } finally {
      setOtpLoading(false)
    }
  }

  function exitOtpMode() {
    setOtpMode(false)
    setOtpEmail('')
    setOtpCode('')
    setOtpCodeSent(false)
    setOtpError('')
  }

  const agreement = (action: string) => (
    <AgreementLine action={action} onOpenTerms={() => router.push(routes.terms())} onOpenPrivacy={() => router.push(routes.privacy())} />
  )

  if (forgotMode) {
    return (
      <AuthScreen
        heading="Reset your password"
        sub={resetSent ? `We sent a reset link to ${resetSent}.` : "Enter your email and we'll send you a link."}
      >
        {!resetSent && (
          <>
            <Input
              label="Email"
              value={resetEmail}
              onChangeText={setResetEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="go"
              onSubmitEditing={handleForgotPassword}
              error={resetError}
              containerStyle={shared.authField}
            />
            <AuthCta label="Send reset link" onPress={handleForgotPassword} loading={resetLoading} disabled={!resetEmail} />
          </>
        )}
        <AuthLink label="Back to sign in" onPress={() => { setForgotMode(false); setResetSent(null); setResetEmail(''); setResetError('') }} />
      </AuthScreen>
    )
  }

  if (otpMode) {
    return (
      <AuthScreen
        heading="Sign in with a code"
        sub={otpCodeSent ? `If ${obfuscateEmail(otpEmail)} has an account, a code is on its way.` : "We'll email you a 6-digit code. No password needed."}
      >
        {!otpCodeSent ? (
          <>
            <Input
              label="Email"
              value={otpEmail}
              onChangeText={setOtpEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="go"
              onSubmitEditing={handleSendOtp}
              error={otpError}
              containerStyle={shared.authField}
            />
            <AuthCta label="Send code" onPress={handleSendOtp} loading={otpLoading} disabled={!otpEmail} />
            {/* A first email-code sign-in creates an account. */}
            {agreement('continuing')}
          </>
        ) : (
          <>
            <Input
              ref={otpCodeRef}
              label="6-digit code"
              value={otpCode}
              onChangeText={text => setOtpCode(text.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="number-pad"
              returnKeyType="go"
              onSubmitEditing={handleVerifyOtp}
              error={otpError}
              containerStyle={shared.authField}
            />
            <AuthCta label="Verify code" onPress={handleVerifyOtp} loading={otpLoading} disabled={otpCode.length < 6} />
            <AuthLink label="Resend code" onPress={() => { setOtpCodeSent(false); setOtpCode(''); setOtpError('') }} />
          </>
        )}
        <AuthLink label="Back to sign in" onPress={exitOtpMode} />
      </AuthScreen>
    )
  }

  return (
    <AuthScreen heading="Welcome back" sub="Sign in to save your spot in games." tab="login">
      <JoinContextCard />
      {socialError ? <Text style={shared.authError}>{socialError}</Text> : null}
      <GoogleButton loading={socialLoading} onPress={() => void handleGoogleSignIn()} />
      <OrWithEmail />

      <Input
        label="Email or username"
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="you@example.com or yourname"
        testID="login-identifier"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={errors.identifier}
        containerStyle={shared.authField}
      />
      <View>
        <View style={shared.authLabelRow}>
          <Text style={[shared.label, shared.authLabelInRow]}>Password</Text>
          <TouchableOpacity
            onPress={() => { setForgotMode(true); setResetEmail(identifier.includes('@') ? identifier : '') }}
            accessibilityRole="button"
            accessibilityLabel="Forgot password?"
            hitSlop={12}
            testID="login-forgot"
          >
            <Text style={shared.authForgot}>Forgot?</Text>
          </TouchableOpacity>
        </View>
        <Input
          ref={passwordRef}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          accessibilityLabel="Password"
          testID="login-password"
          secureTextEntry
          showPasswordToggle
          autoCapitalize="none"
          returnKeyType="go"
          onSubmitEditing={handleLogin}
          error={errors.password}
          containerStyle={shared.authField}
        />
      </View>

      <AuthCta label="Sign in" onPress={handleLogin} loading={loading} disabled={!identifier || !password} testID="login-submit" />
      <AuthLink
        label="Email me a sign-in code instead"
        onPress={() => { setSocialError(''); setOtpEmail(identifier.includes('@') ? identifier : ''); setOtpMode(true) }}
        testID="login-email-code"
      />
      {/* A first Google or email-code sign-in creates an account. */}
      {agreement('continuing')}
    </AuthScreen>
  )
}
