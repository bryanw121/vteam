import { feedbackErrors } from '../utils/feedbackForm'

describe('feedbackErrors (#228: shown under each field)', () => {
  const ok = { kind: 'feature' as const, title: 'Dark mode', description: 'Please', platform: null }

  it('passes a complete form', () => {
    expect(feedbackErrors(ok)).toEqual({})
  })

  it('names each missing field, ignoring blank space', () => {
    expect(feedbackErrors({ ...ok, title: '  ', description: '' })).toEqual({ title: 'Add a short title.', description: 'Add a description.' })
  })

  it('asks a bug report where it happened', () => {
    expect(feedbackErrors({ ...ok, kind: 'bug' })).toEqual({ platform: 'Choose where you saw the bug.' })
    expect(feedbackErrors({ ...ok, kind: 'bug', platform: 'iOS' })).toEqual({})
  })
})
