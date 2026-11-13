/** #188 part 3: the host form's sections render their fields and report changes. */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { ApprovalSection } from '../components/host/ApprovalSection'
import { ClubSection } from '../components/host/ClubSection'
import { PlayersSection } from '../components/host/PlayersSection'
import { RepeatSection } from '../components/host/RepeatSection'
import { HostSubmitButton } from '../components/host/HostSubmitButton'
import { emptyForm } from '../utils/hostForm'
import type { HostRecurrence, Tag } from '../types'

const form = { ...emptyForm(new Date(2026, 10, 13, 18)), title: 'Tuesday 6s' }

it('approval: the caption follows the switch', () => {
  const onChange = jest.fn()
  const { rerender } = render(<ApprovalSection value={false} onChange={onChange} />)
  expect(screen.getByText(/Anyone can join instantly/)).toBeTruthy()
  fireEvent(screen.getByTestId('event-requires-approval-switch'), 'valueChange', true)
  expect(onChange).toHaveBeenCalledWith(true)
  rerender(<ApprovalSection value onChange={onChange} />)
  expect(screen.getByText(/you approve each one/)).toBeTruthy()
})

it('players: Unlimited toggles the cap, and skill tags group by category', () => {
  const setField = jest.fn()
  const onToggleTag = jest.fn()
  const tags = [
    { id: 't1', name: 'Open Play', category: 'event_type' },
    { id: 't2', name: 'Intermediate', category: 'skill_level' },
  ] as Tag[]
  render(<PlayersSection form={form} setField={setField} tags={tags} selectedTagIds={[]} onToggleTag={onToggleTag} />)
  fireEvent.press(screen.getByLabelText('Unlimited players'))
  expect(setField).toHaveBeenCalledWith('maxAttendees', 18)
  expect(screen.getByText('Skill Level')).toBeTruthy()
  expect(screen.queryByText('Open Play')).toBeNull()
  fireEvent.press(screen.getByText('Intermediate'))
  expect(onToggleTag).toHaveBeenCalledWith('t2')
})

it('repeat: off shows only the switch; on shows the count it will create', () => {
  const recurrence: HostRecurrence = { enabled: false, days: [], cadence: 'weekly', endDate: new Date(2026, 11, 31) }
  const { rerender } = render(<RepeatSection recurrence={recurrence} onChange={jest.fn()} eventCount={1} />)
  expect(screen.queryByText(/will be created/)).toBeNull()
  rerender(<RepeatSection recurrence={{ ...recurrence, enabled: true }} onChange={jest.fn()} eventCount={7} />)
  expect(screen.getByText('7 events will be created')).toBeTruthy()
  expect(screen.getByText('On these days')).toBeTruthy()
  rerender(<RepeatSection recurrence={{ ...recurrence, enabled: true, cadence: 'monthly' }} onChange={jest.fn()} eventCount={2} />)
  expect(screen.queryByText('On these days')).toBeNull()
})

it('club: hidden without owned clubs; tapping the picked club clears it', () => {
  const { rerender } = render(<ClubSection clubs={[]} selectedClubId={null} onSelect={jest.fn()} />)
  expect(screen.queryByText('Club (optional)')).toBeNull()
  const onSelect = jest.fn()
  rerender(<ClubSection clubs={[{ id: 'c1', name: 'ATX Sand' }]} selectedClubId="c1" onSelect={onSelect} />)
  fireEvent.press(screen.getByText('ATX Sand'))
  expect(onSelect).toHaveBeenCalledWith(null)
})

it('submit: shows the label, and does nothing while disabled', () => {
  const onPress = jest.fn()
  const { rerender } = render(<HostSubmitButton disabled={false} busy={false} label="Publish 3 events" onPress={onPress} />)
  fireEvent.press(screen.getByText('Publish 3 events'))
  expect(onPress).toHaveBeenCalledTimes(1)
  rerender(<HostSubmitButton disabled busy={false} label="Publish event" onPress={onPress} />)
  fireEvent.press(screen.getByText('Publish event'))
  expect(onPress).toHaveBeenCalledTimes(1)
})
