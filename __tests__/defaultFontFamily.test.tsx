import React from 'react'
import { render } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { Text, TextInput } from '../components/ui/Text'
import { withDefaultFamily, FAMILY_BY_WEIGHT } from '../utils/textScale'
import { theme } from '../constants/theme'

// #385: text whose style names no fontFamily used to fall back to the system font.
const family = (style: unknown) => (StyleSheet.flatten(style as never) as { fontFamily?: string } | undefined)?.fontFamily

describe('default font family (#385)', () => {
  it('picks the Outfit file for the weight', () => {
    expect(family(withDefaultFamily({ fontSize: 14 }))).toBe(theme.fonts.body)
    expect(family(withDefaultFamily({ fontWeight: '600' }))).toBe(theme.fonts.bodySemiBold)
    expect(family(withDefaultFamily({ fontWeight: 'bold' }))).toBe(theme.fonts.bodyBold)
    expect(family(withDefaultFamily({ fontWeight: '800' }))).toBe(theme.fonts.display)
    expect(family(withDefaultFamily(undefined))).toBe(theme.fonts.body)
    expect(family(withDefaultFamily([{ fontSize: 12 }, { fontWeight: '500' }]))).toBe(theme.fonts.bodyMedium)
  })

  it('leaves a style that names a family alone', () => {
    const style = { fontFamily: theme.fonts.display, fontWeight: '400' as const }
    expect(withDefaultFamily(style)).toBe(style)
  })

  it('every weight maps to a theme font', () => {
    for (const f of Object.values(FAMILY_BY_WEIGHT)) expect(Object.values(theme.fonts)).toContain(f)
  })

  it('Text and TextInput apply it; nested Text inherits its parent instead', () => {
    const { getByText, getByTestId } = render(
      <>
        <Text style={{ fontFamily: theme.fonts.display }}>Title <Text style={{ fontWeight: '700' }}>bold</Text></Text>
        <Text style={{ fontSize: 12 }}>plain</Text>
        <TextInput testID="input" style={{ fontSize: 16 }} />
      </>,
    )
    expect(family(getByText('plain').props.style)).toBe(theme.fonts.body)
    expect(family(getByText('bold').props.style)).toBeUndefined()
    expect(family(getByTestId('input').props.style)).toBe(theme.fonts.body)
  })
})
