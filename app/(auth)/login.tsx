import { useState, useRef } from 'react'
import { View, TouchableOpacity, Animated, Modal } from 'react-native'
import { Text, TextInput } from '../../components/ui/Text'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import * as Linking from 'expo-linking'
import Ionicons from '@expo/vector-icons/Ionicons'
import { supabase } from '../../lib/supabase'
import { signInWithGoogle, signInWithApple, sendEmailOtp, verifyEmailOtp } from '../../lib/socialAuth'
import { isUnknownEmailOtpError } from '../../utils/authErrors'
import { signInWithUsername } from '../../lib/usernameAuth'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { GoogleLogo } from '../../components/GoogleLogo'
import { shared, theme } from '../../constants'
import { INCORRECT_EMAIL_OR_PASSWORD } from '../../constants/copy'
import { routes, toRoute } from '../../utils/routes'
import { takeGuestReturnPath } from '../../utils/authGate'
import { AgreementLine } from '../../components/legal/AgreementLine'
import { Spinner } from '../../components/ui/Spinner'

function obfuscateEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  const visible = local.slice(0, 3)
  return `${visible}****@${domain}`
}

export default function Login() {
  const router = useRouter()
  const passwordRef = useRef<TextInput>(null)
  const otpCodeRef = useRef<TextInput>(null)

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({})
  const [forgotMode, setForgotMode] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')

  // ── OTP (magic code) mode ──────────────────────────────────────────────────
  const [otpMode, setOtpMode] = useState(false)
  const [otpEmail, setOtpEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpCodeSent, setOtpCodeSent] = useState(false)
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpError, setOtpError] = useState('')

  // ── Social sign-in ─────────────────────────────────────────────────────────
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null)
  const [socialError, setSocialError] = useState('')

  // ── Minigame ──────────────────────────────────────────────────────────────
  const [score, setScore] = useState(0)
  const [easterEgg, setEasterEgg] = useState(false)
  const [balls, setBalls] = useState([
    { id: 0, top: 8,  left:  10, right: undefined as number | undefined },
    { id: 1, top: 15, left: undefined as number | undefined, right: 8  },
    { id: 2, top: 55, left:  5,  right: undefined as number | undefined },
    { id: 3, top: 70, left: undefined as number | undefined, right: 6  },
    { id: 4, top: 88, left:  30, right: undefined as number | undefined },
  ])
  const scales = useRef(Array.from({ length: 5 }, () => new Animated.Value(1))).current

  function tapBall(i: number) {
    const newScore = score + 1
    setScore(newScore)
    if (newScore === 10) setEasterEgg(true)
    Animated.timing(scales[i], { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setBalls(prev => prev.map((b, idx) => {
        if (idx !== i) return b
        const edge = Math.floor(Math.random() * 4)
        if (edge === 0) return { ...b, top: 2  + Math.random() * 12, left: 5 + Math.random() * 80, right: undefined } // top
        if (edge === 1) return { ...b, top: 82 + Math.random() * 12, left: 5 + Math.random() * 80, right: undefined } // bottom
        if (edge === 2) return { ...b, top: 15 + Math.random() * 65, left: 2,                       right: undefined } // left
                        return { ...b, top: 15 + Math.random() * 65, left: undefined,               right: 2         } // right
      }))
      Animated.timing(scales[i], { toValue: 1, duration: 150, useNativeDriver: true }).start()
    })
  }

  async function handleForgotPassword() {
    const email = resetEmail.toLowerCase().trim()
    if (!email) {
      setResetError('Please enter your email address')
      return
    }
    setResetError('')
    setResetLoading(true)
    try {
      const redirectTo = Linking.createURL('/(auth)/reset-password')
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) {
        setResetError(error.message)
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

  async function handleSocialSignIn(provider: 'google' | 'apple') {
    setSocialError('')
    setSocialLoading(provider)
    try {
      if (provider === 'google') await signInWithGoogle()
      else await signInWithApple()
    } catch (e: any) {
      // Ignore user-cancelled errors
      const msg: string = e?.message ?? ''
      if (!msg.includes('cancel') && !msg.includes('dismiss') && !msg.includes('ERR_CANCELED')) {
        setSocialError(msg || 'Sign-in failed. Please try again.')
      }
    } finally {
      setSocialLoading(null)
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

  return (
    <LinearGradient colors={theme.gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={shared.authBackground}>
      {/* Minigame balls — behind the card */}
      {balls.map((ball, i) => (
        <TouchableOpacity
          key={ball.id}
          onPress={() => tapBall(i)}
          style={{
            position: 'absolute',
            top: `${ball.top}%`,
            ...(ball.right !== undefined ? { right: `${ball.right}%` } : { left: `${ball.left ?? 0}%` }),
          }}
        >
          <Animated.Text style={{ fontSize: theme.font.emoji.giant, opacity: 0.55, transform: [{ scale: scales[i] }] }}>
            🏐
          </Animated.Text>
        </TouchableOpacity>
      ))}

      {/* Easter egg modal */}
      <Modal visible={easterEgg} transparent animationType="none" onRequestClose={() => setEasterEgg(false)}>
        <TouchableOpacity
          onPress={() => setEasterEgg(false)}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <View style={{ backgroundColor: theme.colors.card, borderRadius: 24, padding: 32, alignItems: 'center', gap: 12, maxWidth: 300 }}>
            <Text style={{ fontSize: theme.font.emoji.hero }}>🏐🏆🏐</Text>
            <Text style={{ fontSize: theme.font.heading.md, fontWeight: 'bold', color: theme.colors.primaryText, textAlign: 'center' }}>You're a natural!</Text>
            <Text style={{ fontSize: theme.font.size.lgs, color: '#666', textAlign: 'center' }}>10 spikes. The team needs you. Now go sign in.</Text>
            <Text style={{ fontSize: theme.font.size.sm, color: '#aaa', marginTop: 4 }}>tap to dismiss</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={shared.authCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Text style={shared.authTitle}>vteam</Text>
          <View style={{ backgroundColor: 'rgba(124,77,255,0.15)', borderWidth: 1, borderColor: 'rgba(124,77,255,0.4)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 2 }}>
            <Text style={{ fontSize: theme.font.size.xs, fontWeight: '700', color: theme.colors.primaryText, letterSpacing: 1 }}>BETA</Text>
          </View>
        </View>

        {forgotMode ? (
          <>
            <Text style={shared.authSubtitle}>
              {resetSent ? `reset link sent to ${resetSent}` : 'enter your email to reset your password'}
            </Text>

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
                />
                <Button label="Send reset link" onPress={handleForgotPassword} loading={resetLoading} disabled={!resetEmail} />
              </>
            )}

            <TouchableOpacity style={shared.authLink} onPress={() => { setForgotMode(false); setResetSent(null); setResetEmail(''); setResetError('') }}>
              <Text style={shared.authLinkText}>Back to sign in</Text>
            </TouchableOpacity>
          </>

        ) : otpMode ? (
          <>
            <Text style={shared.authSubtitle}>
              {otpCodeSent ? `if ${obfuscateEmail(otpEmail)} has an account, a code is on its way` : 'sign in with a one-time code'}
            </Text>

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
                />
                <Button label="Send code" onPress={handleSendOtp} loading={otpLoading} disabled={!otpEmail} />
                <AgreementLine
                  action="continuing"
                  onOpenTerms={() => router.push(routes.terms())}
                  onOpenPrivacy={() => router.push(routes.privacy())}
                />
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
                />
                <Button label="Verify code" onPress={handleVerifyOtp} loading={otpLoading} disabled={otpCode.length < 6} />
                <TouchableOpacity style={shared.authLink} onPress={() => { setOtpCodeSent(false); setOtpCode(''); setOtpError('') }}>
                  <Text style={shared.authLinkText}>Resend code</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={shared.authLink} onPress={exitOtpMode}>
              <Text style={shared.authLinkText}>Back to sign in</Text>
            </TouchableOpacity>
          </>

        ) : (
          <>
            <Text style={shared.authSubtitle}>sign in to continue</Text>

            <Input
              label="Email or username"
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="you@example.com or yourname"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => passwordRef.current?.focus()}
              error={errors.identifier}
            />
            <Input
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              showPasswordToggle
              autoCapitalize="none"
              returnKeyType="go"
              onSubmitEditing={handleLogin}
              error={errors.password}
            />

            <Button label="Sign in" onPress={handleLogin} loading={loading} disabled={!identifier || !password} />

            {/* ── Social sign-in ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: theme.spacing.md, gap: theme.spacing.sm }}>
              <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
              <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>or continue with</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
            </View>

            {socialError ? (
              <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.error, textAlign: 'center', marginBottom: theme.spacing.sm }}>
                {socialError}
              </Text>
            ) : null}

            <View style={{ gap: theme.spacing.sm }}>
              <TouchableOpacity
                onPress={() => void handleSocialSignIn('google')}
                disabled={socialLoading !== null}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md,
                  paddingVertical: 12, paddingHorizontal: theme.spacing.md, gap: theme.spacing.sm,
                  backgroundColor: theme.colors.card,
                }}
              >
                {socialLoading === 'google' ? (
                  <Spinner size="small" color={theme.colors.subtext} />
                ) : (
                  <GoogleLogo size={18} />
                )}
                <Text style={{ fontSize: theme.font.size.md, color: theme.colors.text, fontWeight: theme.font.weight.medium }}>
                  Continue with Google
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => { setSocialError(''); setOtpEmail(identifier.includes('@') ? identifier : ''); setOtpMode(true) }}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md,
                  paddingVertical: 12, paddingHorizontal: theme.spacing.md, gap: theme.spacing.sm,
                  backgroundColor: theme.colors.card,
                }}
              >
                <Ionicons name="mail-outline" size={16} color={theme.colors.text} />
                <Text style={{ fontSize: theme.font.size.md, color: theme.colors.text, fontWeight: theme.font.weight.medium }}>
                  Sign in with email code
                </Text>
              </TouchableOpacity>
            </View>
            {/* A first Google / Apple / email-code sign-in creates an account. */}
            <AgreementLine
              action="continuing"
              onOpenTerms={() => router.push(routes.terms())}
              onOpenPrivacy={() => router.push(routes.privacy())}
            />

            <TouchableOpacity style={shared.authLink} onPress={() => { setForgotMode(true); setResetEmail(identifier.includes('@') ? identifier : '') }}>
              <Text style={shared.authLinkText}>Forgot password?</Text>
            </TouchableOpacity>
            <TouchableOpacity style={shared.authLink} onPress={() => router.push(routes.register())}>
              <Text style={shared.authLinkText}>Don't have an account? Sign up</Text>
            </TouchableOpacity>
            <TouchableOpacity style={shared.authLink} onPress={() => router.replace(toRoute(takeGuestReturnPath()))} testID="continue-as-guest">
              <Text style={shared.authLinkSubtle}>Keep browsing without an account</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

    </LinearGradient>
  )
}
