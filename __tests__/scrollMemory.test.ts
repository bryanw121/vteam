import { clearScrollMemory, isShown, recallScroll, rememberScroll, restoreWhenReady } from '../utils/scrollMemory'

/** Runs queued "frames" one at a time, like requestAnimationFrame. */
function frames() {
  const queue: Array<() => void> = []
  return {
    nextFrame: (cb: () => void) => { queue.push(cb) },
    run(n = Infinity) {
      let ran = 0
      while (queue.length && ran < n) { queue.shift()!(); ran++ }
      return ran
    },
  }
}

describe('scroll memory', () => {
  beforeEach(() => clearScrollMemory())

  it('remembers an offset per key and forgets them all on clear', () => {
    rememberScroll('tab:profile:menu', 838)
    rememberScroll('tab:events', 2348)
    expect(recallScroll('tab:profile:menu')).toBe(838)
    expect(recallScroll('tab:events')).toBe(2348)
    expect(recallScroll('tab:clubs')).toBe(0)
    clearScrollMemory()
    expect(recallScroll('tab:events')).toBe(0)
  })

  it('never stores a negative offset (iOS rubber-band overscroll)', () => {
    rememberScroll('tab:clubs', -40)
    expect(recallScroll('tab:clubs')).toBe(0)
  })

  it('treats a node with no height (display:none ancestor) as hidden', () => {
    expect(isShown(null)).toBe(false)
    expect(isShown({ offsetHeight: 0 })).toBe(false)
    expect(isShown({ offsetHeight: 844 })).toBe(true)
  })
})

describe('restoreWhenReady', () => {
  it('waits until the target is ready, then applies the offset', () => {
    const f = frames()
    let ready = false
    let y = 0
    restoreWhenReady({ y: 838, ready: () => ready, apply: to => { y = to }, current: () => y, nextFrame: f.nextFrame })
    f.run(3)
    expect(y).toBe(0)
    ready = true
    f.run()
    expect(y).toBe(838)
  })

  it('retries while the content is too short and the browser clamps the offset', () => {
    const f = frames()
    let height = 300
    let y = 0
    const apply = jest.fn((to: number) => { y = Math.min(to, height) })
    restoreWhenReady({ y: 838, ready: () => true, apply, current: () => y, nextFrame: f.nextFrame })
    f.run(2)
    expect(y).toBe(300)
    height = 2000 // the rest of the screen laid out
    f.run()
    expect(y).toBe(838)
    expect(apply.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(f.run()).toBe(0) // stopped once it took
  })

  it('gives up after the frame budget', () => {
    const f = frames()
    const apply = jest.fn()
    restoreWhenReady({ y: 500, ready: () => false, apply, current: () => 0, frames: 5, nextFrame: f.nextFrame })
    expect(f.run()).toBe(5)
    expect(apply).not.toHaveBeenCalled()
  })
})
