import { useState, useRef } from 'react'
import { View, TouchableOpacity } from 'react-native'
import { Text, TextInput } from '../../components/ui/Text'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { signInWithGoogle } from '../../lib/socialAuth'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { GoogleLogo } from '../../components/GoogleLogo'
import { shared, theme } from '../../constants'
import { routes, toRoute } from '../../utils/routes'
import { takeGuestReturnPath } from '../../utils/authGate'
import { AgreementLine } from '../../components/legal/AgreementLine'
import { TERMS_VERSION } from '../../constants/legal'
import { Spinner } from '../../components/ui/Spinner'
import { JoinContextCard } from '../../components/auth/JoinContextCard'
import { toast } from '../../lib/toast'

export default function Register() {
  const router = useRouter()
  const lastNameRef = useRef<TextInput>(null)
  const usernameRef = useRef<TextInput>(null)
  const emailRef = useRef<TextInput>(null)
  const passwordRef = useRef<TextInput>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string; username?: string; email?: string; password?: string }>({})

  const [socialLoading, setSocialLoading] = useState(false)
  const [socialError, setSocialError] = useState('')

  async function handleSocialSignIn(provider: 'google') {
    setSocialError('')
    setSocialLoading(true)
    try {
      if (provider === 'google') await signInWithGoogle()
    } catch (e: any) {
      const msg: string = e?.message ?? ''
      if (!msg.includes('cancel') && !msg.includes('dismiss') && !msg.includes('ERR_CANCELED')) {
        setSocialError(msg || 'Sign-in failed. Please try again.')
      }
    } finally {
      setSocialLoading(false)
    }
  }

  async function handleRegister() {
    setErrors({})

    const trimmedFirst = firstName.trim()
    const trimmedLast = lastName.trim()
    if (!trimmedFirst) { setErrors({ firstName: 'First name is required' }); return }
    if (!trimmedLast)  { setErrors({ lastName:  'Last name is required'  }); return }

    setLoading(true)
    try {
      const normalizedUsername = username.toLowerCase().trim()
      const normalizedEmail = email.toLowerCase().trim()

      // Check username availability
      const { data: existingUsername } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', normalizedUsername)
        .maybeSingle()

      if (existingUsername) {
        setErrors({ username: 'Username already taken' })
        return
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        // terms_version: the Terms shown by the agreement line under the button (passive clickwrap).
        options: { data: { username: normalizedUsername, first_name: trimmedFirst, last_name: trimmedLast, terms_version: TERMS_VERSION } },
      })

      if (error) {
        const msg = error.message.toLowerCase()
        if (msg.includes('already') || msg.includes('registered') || error.code === 'user_already_exists') {
          setErrors({ email: 'An account with this email already exists' })
        } else {
          setErrors({ password: error.message })
        }
        return
      }

      // When email confirmation is on, Supabase silently returns a user with no
      // identities instead of erroring (prevents email enumeration). Detect it here.
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        setErrors({ email: 'An account with this email already exists' })
        return
      }

      // Also update the profile row directly in case the trigger doesn't set names
      if (data.user) {
        await supabase.from('profiles')
          .update({ first_name: trimmedFirst, last_name: trimmedLast })
          .eq('id', data.user.id)
      }

      // With a session (email confirmation off) the root layout already takes
      // them back where they came from (#229: the game they were joining).
      if (data.session) return
      // A toast, not Alert.alert: that does nothing on the web (#228). The (auth) layout hosts toasts, so it shows over sign-in.
      toast.show({ title: 'Account created', message: 'Check your email to confirm it, then sign in.', variant: 'success', duration: 8000 })
      router.replace(routes.login())
    } finally {
      setLoading(false)
    }
  }

  return (
    <LinearGradient colors={theme.gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={shared.authBackground}>
      <View style={shared.authCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Text style={shared.authTitle}>vteam</Text>
          <View style={{ backgroundColor: 'rgba(124,77,255,0.15)', borderWidth: 1, borderColor: 'rgba(124,77,255,0.4)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 2 }}>
            <Text style={{ fontSize: theme.font.size.xs, fontWeight: '700', color: theme.colors.primary, letterSpacing: 1 }}>BETA</Text>
          </View>
        </View>
        <Text style={shared.authSubtitle}>create your account</Text>
        <JoinContextCard screen="register" />

        {/* ── Social sign-up ── */}
        {socialError ? (
          <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.error, textAlign: 'center', marginBottom: theme.spacing.sm }}>
            {socialError}
          </Text>
        ) : null}

        <View style={{ gap: theme.spacing.sm }}>
          <TouchableOpacity
            onPress={() => void handleSocialSignIn('google')}
            disabled={socialLoading}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md,
              paddingVertical: 12, paddingHorizontal: theme.spacing.md, gap: theme.spacing.sm,
              backgroundColor: theme.colors.card,
            }}
          >
            {socialLoading ? (
              <Spinner size="small" color={theme.colors.subtext} />
            ) : (
              <GoogleLogo size={18} />
            )}
            <Text style={{ fontSize: theme.font.size.md, color: theme.colors.text, fontWeight: theme.font.weight.medium }}>
              Continue with Google
            </Text>
          </TouchableOpacity>

        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: theme.spacing.md, gap: theme.spacing.sm }}>
          <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
          <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>or register with email</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
        </View>

        <Input
          label="First Name"
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Jane"
          autoCorrect={false}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => lastNameRef.current?.focus()}
          error={errors.firstName}
        />
        <Input
          ref={lastNameRef}
          label="Last Name"
          value={lastName}
          onChangeText={setLastName}
          placeholder="Smith"
          autoCorrect={false}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => usernameRef.current?.focus()}
          error={errors.lastName}
        />
        <Input
          ref={usernameRef}
          label="Username"
          value={username}
          onChangeText={setUsername}
          placeholder="yourname"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => emailRef.current?.focus()}
          error={errors.username}
        />
        <Input
          ref={emailRef}
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => passwordRef.current?.focus()}
          error={errors.email}
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
          onSubmitEditing={handleRegister}
          error={errors.password}
        />

        <Button label="Create account" onPress={handleRegister} loading={loading} disabled={!firstName || !lastName || !username || !email || !password} />
        {/* Covers every way to sign up on this screen (Google above, email here). */}
        <AgreementLine
          action="continuing or creating an account"
          onOpenTerms={() => router.push(routes.terms())}
          onOpenPrivacy={() => router.push(routes.privacy())}
        />
        <TouchableOpacity style={shared.authLink} onPress={() => router.push(routes.login())}>
          <Text style={shared.authLinkText}>already have an account? sign in</Text>
        </TouchableOpacity>
        <TouchableOpacity style={shared.authLink} onPress={() => router.replace(toRoute(takeGuestReturnPath()))} testID="continue-as-guest">
          <Text style={shared.authLinkSubtle}>Keep browsing without an account</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  )
}
