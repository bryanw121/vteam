import { useState, useRef } from 'react'
import { View } from 'react-native'
import { Text, TextInput } from '../../components/ui/Text'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { signInWithGoogle } from '../../lib/socialAuth'
import { Input } from '../../components/Input'
import { shared } from '../../constants'
import { routes } from '../../utils/routes'
import { AgreementLine } from '../../components/legal/AgreementLine'
import { TERMS_VERSION } from '../../constants/legal'
import { AuthScreen } from '../../components/auth/AuthScreen'
import { AuthCta, GoogleButton, OrWithEmail } from '../../components/auth/AuthBits'
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

  async function handleGoogleSignIn() {
    setSocialError('')
    setSocialLoading(true)
    try {
      await signInWithGoogle()
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

      // Check username availability. Usernames are stored lower-case, so an exact
      // match is enough (ilike treated `_` as a wildcard: `a_b` looked taken if `axb` existed).
      const { data: existingUsername } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', normalizedUsername)
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
    <AuthScreen heading="Join the game" sub="Find games, save your spot, earn points." tab="register">
      <JoinContextCard />
      {socialError ? <Text style={shared.authError}>{socialError}</Text> : null}
      <GoogleButton loading={socialLoading} onPress={() => void handleGoogleSignIn()} />
      <OrWithEmail />

      <View style={shared.authNameRow}>
        <Input
          label="First name"
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Jane"
          autoCorrect={false}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => lastNameRef.current?.focus()}
          error={errors.firstName}
          containerStyle={shared.authFieldFlex}
          testID="register-first-name"
        />
        <Input
          ref={lastNameRef}
          label="Last name"
          value={lastName}
          onChangeText={setLastName}
          placeholder="Smith"
          autoCorrect={false}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => usernameRef.current?.focus()}
          error={errors.lastName}
          containerStyle={shared.authFieldFlex}
          testID="register-last-name"
        />
      </View>
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
        containerStyle={shared.authField}
        testID="register-username"
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
        containerStyle={shared.authField}
        testID="register-email"
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
        containerStyle={shared.authField}
        testID="register-password"
      />

      <AuthCta label="Create account" onPress={handleRegister} loading={loading} disabled={!firstName || !lastName || !username || !email || !password} testID="register-submit" />
      {/* Covers every way to sign up on this screen (Google above, email here). */}
      <AgreementLine
        action="continuing or creating an account"
        onOpenTerms={() => router.push(routes.terms())}
        onOpenPrivacy={() => router.push(routes.privacy())}
      />
    </AuthScreen>
  )
}
