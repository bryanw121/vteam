import { useState } from 'react'
import { TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { Text } from '../ui/Text'
import { shared, theme } from '../../constants'
import { peekPendingAction } from '../../utils/pendingAction'
import { eventDateMs } from '../../hooks/event/derive'
import { routes } from '../../utils/routes'

type Props = {
  /** Which auth screen this is: the switch highlights it and replaces it with the other. */
  screen: 'register' | 'login'
}

/** "Sun, Nov 15 · 9:00 AM" in the viewer's zone, like the join footer. */
function whenLabel(startsAt: string): string {
  const start = new Date(eventDateMs(startsAt))
  const day = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const time = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${day} · ${time}`
}

/**
 * On sign-up and sign-in, when a guest got here by tapping Join (#229): which
 * game they're joining, and a two-way switch between "New here" and "I have an
 * account" (each still its own route). Renders nothing otherwise. Read once on
 * mount from the saved intent: no request.
 */
export function JoinContextCard({ screen }: Props) {
  const router = useRouter()
  const [pending] = useState(() => peekPendingAction())
  if (!pending) return null

  const spots = pending.spotsLeft
  const spotsLine = spots == null ? null : spots === 0 ? 'Full: you can join the waitlist' : `${spots} ${spots === 1 ? 'spot' : 'spots'} left`
  const options: { key: Props['screen']; label: string }[] = [
    { key: 'register', label: 'New here' },
    { key: 'login', label: 'I have an account' },
  ]

  return (
    <View testID="join-context">
      <View style={shared.joinContextCard}>
        <Text style={shared.joinContextEyebrow}>YOU'RE JOINING</Text>
        <Text style={shared.joinContextTitle} numberOfLines={2} testID="join-context-title">{pending.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          <Ionicons name="time" size={14} color={theme.colors.timeText} aria-hidden />
          <Text style={shared.joinContextMeta}>{whenLabel(pending.startsAt)}{spotsLine ? ` · ${spotsLine}` : ''}</Text>
        </View>
      </View>
      <View style={shared.authModeSwitch} role="tablist">
        {options.map(option => {
          const active = option.key === screen
          return (
            <TouchableOpacity
              key={option.key}
              role="tab"
              accessibilityState={{ selected: active }}
              style={[shared.authModeOption, active && shared.authModeOptionActive]}
              onPress={() => { if (!active) router.replace(option.key === 'login' ? routes.login() : routes.register()) }}
              testID={`auth-mode-${option.key}`}
            >
              <Text style={[shared.authModeText, active && shared.authModeTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}
