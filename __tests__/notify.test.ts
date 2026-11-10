import { notifyError, notifyInfo } from '../utils/notify'
import { __resetToast, toast } from '../lib/toast'
import { GENERIC_ERROR_MESSAGE } from '../constants/copy'
import { TOURNAMENT_GENERIC_ERROR } from '../constants/tournamentCopy'

describe('utils/notify (#228: a toast on every platform)', () => {
  let webAlert: jest.Mock
  beforeEach(() => {
    __resetToast()
    webAlert = jest.fn()
    ;(global as unknown as { window: { alert: unknown } }).window.alert = webAlert
  })

  it('shows info as a toast, never window.alert', () => {
    notifyInfo('Saved', 'Done.')
    expect(toast.current()).toMatchObject({ title: 'Saved', message: 'Done.', variant: 'info' })
    notifyInfo('Saved')
    expect(toast.current()).toMatchObject({ message: 'Saved', variant: 'info' })
    expect(webAlert).not.toHaveBeenCalled()
  })

  it('notifyError takes a message or an error, falling back to the shared copy', () => {
    const shown: string[] = []
    const off = toast.subscribe(t => { if (t) shown.push(t.message) })
    notifyError('Oops', 'Specific.')
    notifyError('Oops', new Error('From server'))
    notifyError('Oops', { not: 'an error' })
    notifyError('Oops')
    off()
    expect(shown).toEqual(['Specific.', 'From server', GENERIC_ERROR_MESSAGE, GENERIC_ERROR_MESSAGE])
    expect(toast.current()).toMatchObject({ title: 'Oops', variant: 'error' })
  })

  it('tournament copy points at the shared generic error', () => {
    expect(TOURNAMENT_GENERIC_ERROR).toBe(GENERIC_ERROR_MESSAGE)
  })
})
