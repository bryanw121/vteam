import { attendeesPaid, paymentVisibility } from '../hooks/event/derive'

const status = (o: Partial<{ isAttending: boolean; isWaitlisted: boolean; isOwner: boolean }> = {}) =>
  ({ isAttending: false, isWaitlisted: false, isOwner: false, ...o })

describe('paymentVisibility', () => {
  const paid = { price: 10 }

  it('free events show no payment UI to anyone', () => {
    for (const price of [0, null]) {
      const v = paymentVisibility({ event: { price }, userId: 'u', status: status({ isAttending: true }), isHostOrCohost: true })
      expect(v).toEqual({ canToggle: false, canSeeAll: false })
    }
  })

  it('an attending or waitlisted player can mark themselves paid', () => {
    expect(paymentVisibility({ event: paid, userId: 'u', status: status({ isAttending: true }), isHostOrCohost: false }).canToggle).toBe(true)
    expect(paymentVisibility({ event: paid, userId: 'u', status: status({ isWaitlisted: true }), isHostOrCohost: false }).canToggle).toBe(true)
  })

  it('someone not on the roster, a guest, or the creator gets no toggle', () => {
    expect(paymentVisibility({ event: paid, userId: 'u', status: status(), isHostOrCohost: false }).canToggle).toBe(false)
    expect(paymentVisibility({ event: paid, userId: null, status: status({ isAttending: true }), isHostOrCohost: false }).canToggle).toBe(false)
    expect(paymentVisibility({ event: paid, userId: 'h', status: status({ isAttending: true, isOwner: true }), isHostOrCohost: true }).canToggle).toBe(false)
  })

  it('only hosts and co-hosts see everyone\'s flags', () => {
    expect(paymentVisibility({ event: paid, userId: 'h', status: status({ isOwner: true }), isHostOrCohost: true }).canSeeAll).toBe(true)
    expect(paymentVisibility({ event: paid, userId: 'u', status: status({ isAttending: true }), isHostOrCohost: false }).canSeeAll).toBe(false)
  })
})

describe('attendeesPaid', () => {
  it('counts only roster players present in the paid set', () => {
    expect(attendeesPaid([{ id: 'a' }, { id: 'b' }, { id: 'c' }], new Set(['a', 'c', 'gone']))).toBe(2)
  })
})
