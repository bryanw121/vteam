import { StyleSheet } from 'react-native'
import { browserTextScale, parseTextSize, scaleTextStyle, textScaleFor, textSizeScale } from '../utils/textScale'
import { MAX_TEXT_SCALE, TEXT_SIZE_OPTIONS, TIGHT_TEXT_SCALE } from '../constants/textSize'

describe('text size setting', () => {
  it('has four options from Small to Extra large', () => {
    expect(TEXT_SIZE_OPTIONS.map(o => [o.id, o.scale])).toEqual([
      ['small', 0.9], ['default', 1], ['large', 1.15], ['xlarge', 1.3],
    ])
  })

  it('parses stored values, falling back to Default', () => {
    expect(parseTextSize('large')).toBe('large')
    expect(parseTextSize('huge')).toBe('default')
    expect(parseTextSize(null)).toBe('default')
    expect(textSizeScale('xlarge')).toBe(1.3)
  })

  it('reads the browser text size from the root font size, clamped', () => {
    expect(browserTextScale(16)).toBe(1)
    expect(browserTextScale(20)).toBe(1.25)
    expect(browserTextScale(64)).toBe(MAX_TEXT_SCALE)
    expect(browserTextScale(4)).toBe(0.75)
    expect(browserTextScale(NaN)).toBe(1)
  })
})

describe('textScaleFor', () => {
  it('web: the in-app and browser scales multiply, up to the cap', () => {
    expect(textScaleFor('web', 1.15, 1).factor).toBeCloseTo(1.15)
    expect(textScaleFor('web', 1.3, 1.25).factor).toBeCloseTo(1.625)
    expect(textScaleFor('web', 1.3, 2).factor).toBe(MAX_TEXT_SCALE)
    expect(textScaleFor('web', 1.3, 1.25, TIGHT_TEXT_SCALE).factor).toBe(TIGHT_TEXT_SCALE)
  })

  it('native: the font size takes the in-app part and RN caps the OS part to what is left', () => {
    const total = (app: number, os: number, cap?: number) => {
      const { factor, maxFontSizeMultiplier } = textScaleFor('native', app, os, cap)
      return factor * Math.min(os, maxFontSizeMultiplier) // what React Native renders
    }
    expect(total(1, 1)).toBe(1)
    expect(total(1.15, 1.2)).toBeCloseTo(1.38)
    expect(total(1.3, 3)).toBeCloseTo(MAX_TEXT_SCALE) // a 3x Dynamic Type is capped
    expect(total(1.3, 1.5, TIGHT_TEXT_SCALE)).toBeCloseTo(TIGHT_TEXT_SCALE)
    expect(total(0.9, 1)).toBeCloseTo(0.9)
    // RN reads a multiplier below 1 as "no cap", so it never goes below 1.
    expect(textScaleFor('native', 1.3, 1, 1.2).maxFontSizeMultiplier).toBe(1)
  })
})

describe('scaleTextStyle', () => {
  it('returns the same style at 1x', () => {
    const style = { fontSize: 14 }
    expect(scaleTextStyle(style, 1)).toBe(style)
  })

  it('scales fontSize and lineHeight from flattened styles', () => {
    const styles = StyleSheet.create({ a: { fontSize: 14, lineHeight: 20, color: 'red' } })
    const flat = StyleSheet.flatten(scaleTextStyle([styles.a, { letterSpacing: 1 }], 1.3))
    expect(flat).toMatchObject({ fontSize: 18.2, lineHeight: 26, color: 'red', letterSpacing: 1 })
  })

  it('leaves text without its own fontSize to inherit', () => {
    const style = { color: 'red' }
    expect(scaleTextStyle(style, 1.3)).toBe(style)
  })

  it('keeps sizes that start at the floor at or above it (web inputs ≥16px)', () => {
    expect(StyleSheet.flatten(scaleTextStyle({ fontSize: 16 }, 0.9, 16))).toMatchObject({ fontSize: 16 })
    expect(StyleSheet.flatten(scaleTextStyle({ fontSize: 14 }, 0.9, 16))).toMatchObject({ fontSize: 12.6 })
    expect(StyleSheet.flatten(scaleTextStyle({ fontSize: 16, lineHeight: 20 }, 0.9, 16))).toMatchObject({ fontSize: 16, lineHeight: 20 })
  })
})

// ─── Provider + Text: the setting reaches rendered text without a reload ─────

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {}
  return { __esModule: true, default: { getItem: jest.fn(async (k: string) => store[k] ?? null), setItem: jest.fn(async (k: string, v: string) => { store[k] = v }) } }
})

import React from 'react'
import { Pressable } from 'react-native'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { TextScaleProvider, useTextScale } from '../contexts/textScale'
import { Text } from '../components/ui/Text'
import { TEXT_SIZE_STORAGE_KEY } from '../constants/textSize'

function Harness() {
  const { setSize } = useTextScale()
  return (
    <>
      <Text testID="sample" style={{ fontSize: 14, lineHeight: 20 }}>Hello</Text>
      <Text testID="tight" maxFontSizeMultiplier={TIGHT_TEXT_SCALE} style={{ fontSize: 11 }}>Mon</Text>
      <Pressable testID="xl" onPress={() => setSize('xlarge')} />
    </>
  )
}
const fontOf = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style)

describe('TextScaleProvider', () => {
  it('rescales text when the setting changes, and saves it on the device', async () => {
    render(<TextScaleProvider><Harness /></TextScaleProvider>)
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(TEXT_SIZE_STORAGE_KEY))
    expect(fontOf('sample')).toMatchObject({ fontSize: 14, lineHeight: 20 })
    await act(async () => { fireEvent.press(screen.getByTestId('xl')) })
    expect(fontOf('sample')).toMatchObject({ fontSize: 18.2, lineHeight: 26 })
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(TEXT_SIZE_STORAGE_KEY, 'xlarge')
    // Native: the OS part is capped to what the cap leaves (1.3 / 1.3 = 1, i.e. none).
    expect(screen.getByTestId('tight').props.maxFontSizeMultiplier).toBe(1)
  })

  it('starts from the stored setting', async () => {
    await AsyncStorage.setItem(TEXT_SIZE_STORAGE_KEY, 'small')
    render(<TextScaleProvider><Harness /></TextScaleProvider>)
    await waitFor(() => expect(fontOf('sample')).toMatchObject({ fontSize: 12.6 }))
  })
})
