import { View } from 'react-native'
import { Stack } from 'expo-router'
import { ToastHost } from '../../components/ToastHost'
import { theme, SWIPE_NAVIGATION } from '../../constants'

export default function AuthLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          gestureEnabled: SWIPE_NAVIGATION.back,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      />
      {/* lib/toast messages on the sign-in screens (#228). */}
      <ToastHost />
    </View>
  )
}
