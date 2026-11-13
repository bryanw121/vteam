/** #188 part 4: the host form's state hook (create path; edit loading is covered in eventLoadSpeed). */
import { act, renderHook } from '@testing-library/react-native'

jest.mock('../lib/supabase', () => ({ supabase: { from: jest.fn() } }))
jest.mock('../lib/query', () => ({ getQueryData: () => null }))

import { useHostForm } from '../hooks/host/useHostForm'

const base = { editId: null, clubIdParam: null, userId: 'u1', sessionLoading: false }

it('starts from a link’s prefill and the club it names', () => {
  const { result } = renderHook(() => useHostForm({ ...base, params: { location: 'Zilker', surface: 'sand', maxAttendees: '8' }, clubIdParam: 'c1' }))
  expect(result.current.form).toMatchObject({ location: 'Zilker', surface: 'sand', maxAttendees: 8 })
  expect(result.current.selectedClubId).toBe('c1')
  expect(result.current.editState).toBe('idle')
})

it('sets fields, toggles tags, and resets after a create', () => {
  const { result } = renderHook(() => useHostForm({ ...base, params: {} }))
  act(() => { result.current.setField('title', 'Tuesday 6s'); result.current.toggleTag('t1'); result.current.setSelectedClubId('c2') })
  expect(result.current.form.title).toBe('Tuesday 6s')
  expect(result.current.selectedTagIds).toEqual(['t1'])
  act(() => result.current.toggleTag('t1'))
  expect(result.current.selectedTagIds).toEqual([])
  act(() => { result.current.setRecurrence(prev => ({ ...prev, enabled: true })); result.current.reset() })
  expect(result.current.form.title).toBe('')
  expect(result.current.recurrence.enabled).toBe(false)
  expect(result.current.selectedClubId).toBeNull()
})
