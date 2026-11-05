import { Stack } from 'expo-router'
import { theme, SWIPE_NAVIGATION } from '../../constants'

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: SWIPE_NAVIGATION.back,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    />
  )
}
