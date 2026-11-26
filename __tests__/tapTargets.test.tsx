import React from 'react'
import { render } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { Chip } from '../components/ui/Chip'
import { IconButton } from '../components/ui/IconButton'
import { hitSquare, hitV, TAP_MIN } from '../utils/hitArea'

// #386: on phones every control's touchable is at least 44 pt, while the drawn control keeps its size.
const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, number>

describe('44-pt tap targets (#386)', () => {
  it('hitV pads a drawn height up to 44 and gives the room back as negative margin', () => {
    expect(hitV(32)).toEqual({ paddingVertical: 6, marginVertical: -6 })
    expect(hitV(44)).toEqual({})
    expect(hitV(50)).toEqual({})
    const s = hitV(23)
    expect(23 + 2 * (s.paddingVertical as number)).toBeGreaterThanOrEqual(TAP_MIN - 0.01)
  })

  it('hitSquare does it in both directions', () => {
    expect(hitSquare(32)).toEqual({ padding: 6, margin: -6 })
    expect(hitSquare(20)).toEqual({ padding: 12, margin: -12 })
  })

  it('Chip: the touchable is 44 tall around the 32-pt pill', () => {
    const { getByTestId } = render(<Chip label="Sand" onPress={() => {}} testID="chip" />)
    expect(flat(getByTestId('chip').props.style)).toMatchObject({ paddingVertical: 6, marginVertical: -6 })
  })

  it('IconButton: a 38-pt square sits in a 44-pt touchable; 44 needs nothing extra', () => {
    const { getByTestId, rerender } = render(<IconButton icon="notifications-outline" label="Notifications" onPress={() => {}} testID="bell" />)
    expect(flat(getByTestId('bell').props.style)).toMatchObject({ padding: 3, margin: -3 })
    rerender(<IconButton icon="add" label="Add" size={44} onPress={() => {}} testID="bell" />)
    expect(flat(getByTestId('bell').props.style) ?? {}).not.toHaveProperty('padding')
  })
})
