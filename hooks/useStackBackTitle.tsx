import React, { useLayoutEffect } from 'react'
import { HeaderBackButton, type HeaderBackButtonProps } from 'expo-router/react-navigation'
import { useNavigation, useRouter } from 'expo-router'
import { theme } from '../constants/theme'
import { routes } from '../utils/routes'

/**
 * Settings routes render under `settings/_layout` → `<Slot />`, which uses an inner
 * stack that does not paint the native header. The visible bar is the parent `(tabs)`
 * stack, so we set options on `getParent()` as well as the leaf navigator.
 *
 * The back button always renders regardless of navigation history — after a hard
 * web refresh there is no stack, so we fall back to `/profile` instead of calling
 * `router.back()` into nothing.
 */
export function useStackBackTitle(screenTitle: string) {
  const navigation = useNavigation()
  const router = useRouter()

  useLayoutEffect(() => {
    const opts = {
      title: screenTitle,
      headerTitle: screenTitle,
      headerTitleAlign: 'left' as const,
      headerBackTitle: '',
      headerLeft: (props: HeaderBackButtonProps) => (
        <HeaderBackButton
          {...props}
          displayMode="minimal"
          tintColor={props.tintColor ?? theme.colors.primary}
          onPress={() => {
            if (router.canGoBack()) {
              router.back()
            } else {
              router.replace(routes.profile())
            }
          }}
        />
      ),
    }
    navigation.setOptions(opts)
    navigation.getParent()?.setOptions(opts)
  }, [navigation, screenTitle, router])
}
