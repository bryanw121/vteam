import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Platform, useWindowDimensions } from 'react-native'
import { DEFAULT_TEXT_SIZE } from '../constants/textSize'
import { loadTextSize, loadTextSizeSync, saveTextSize } from '../lib/textSizeStore'
import { browserTextScale, textSizeScale } from '../utils/textScale'
import type { TextScaleContextValue, TextSizeId } from '../types'

const TextScaleContext = createContext<TextScaleContextValue>({
  size: DEFAULT_TEXT_SIZE,
  appScale: 1,
  osScale: 1,
  setSize: () => {},
})

function readBrowserScale(): number {
  try {
    if (typeof document === 'undefined') return 1
    return browserTextScale(parseFloat(getComputedStyle(document.documentElement).fontSize))
  } catch {
    return 1
  }
}

type Props = { children: ReactNode }

/**
 * The text size setting (#43). Every `components/ui/Text` reads it, so changing
 * it re-renders text app-wide without a reload.
 *
 * The first render is always Default with no browser scale, on web too, so the
 * static HTML hydrates (React #418 otherwise); the stored value and the browser
 * text size are applied in an effect, which runs in the same commit that mounts
 * the app tree under the splash.
 */
export function TextScaleProvider({ children }: Props) {
  const [size, setSizeState] = useState<TextSizeId>(DEFAULT_TEXT_SIZE)
  const [browserScale, setBrowserScale] = useState(1)
  const { fontScale } = useWindowDimensions()
  // A choice made before the stored value arrives (native) wins over it.
  const chosen = useRef(false)

  useEffect(() => {
    let cancelled = false
    if (Platform.OS === 'web') {
      setBrowserScale(readBrowserScale())
      setSizeState(loadTextSizeSync() ?? DEFAULT_TEXT_SIZE)
      return
    }
    void loadTextSize().then(stored => {
      if (cancelled || chosen.current) return
      setSizeState(stored)
    })
    return () => { cancelled = true }
  }, [])

  const setSize = useCallback((next: TextSizeId) => {
    chosen.current = true
    setSizeState(next)
    void saveTextSize(next)
  }, [])

  // Native: useWindowDimensions().fontScale is the live Dynamic Type / Android
  // font scale. react-native-web always reports 1 there, so web reads the root font size.
  const osScale = Platform.OS === 'web' ? browserScale : fontScale || 1

  const value = useMemo<TextScaleContextValue>(
    () => ({ size, appScale: textSizeScale(size), osScale, setSize }),
    [size, osScale, setSize],
  )
  return <TextScaleContext.Provider value={value}>{children}</TextScaleContext.Provider>
}

export function useTextScale(): TextScaleContextValue {
  return useContext(TextScaleContext)
}
