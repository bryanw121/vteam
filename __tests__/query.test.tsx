import React from 'react'
import { Text } from 'react-native'
import { render, act, screen } from '@testing-library/react-native'
import {
  queryKey,
  useQuery,
  useQueries,
  useMutation,
  invalidate,
  setQueryData,
  getQueryData,
  removeQueries,
  __resetQueryCache,
  type QueryResult,
  type MutationResult,
} from '../lib/query'

// expo-router's real useFocusEffect needs a navigator; nothing here focuses.
jest.mock('expo-router', () => ({ useFocusEffect: () => {} }))

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Let resolved fetcher promises settle and React flush the resulting updates. */
async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

let latest: Record<string, QueryResult<string>> = {}

function Reader({
  id,
  qkey,
  fetcher,
  staleMs,
  enabled,
}: {
  id: string
  qkey: string | null
  fetcher: () => Promise<string>
  staleMs?: number
  enabled?: boolean
}) {
  const q = useQuery<string>(qkey, fetcher, { staleMs, enabled })
  latest[id] = q
  return <Text testID={id}>{q.data ?? (q.isLoading ? 'loading' : 'empty')}</Text>
}

beforeEach(() => {
  __resetQueryCache()
  latest = {}
  jest.useRealTimers()
})

describe('queryKey', () => {
  it('joins parts with ":" and escapes separators inside parts', () => {
    expect(queryKey('event', 'abc')).toBe('event:abc')
    expect(queryKey('feed', 2026, null, undefined)).toBe('feed:2026:_:_')
    expect(queryKey('t', '2026-10-24T10:00')).toBe('t:2026-10-24T10%3A00')
  })

})

describe('useQuery', () => {
  it('shows isLoading until the first fetch lands', async () => {
    const d = deferred<string>()
    render(<Reader id="a" qkey="k" fetcher={() => d.promise} />)
    expect(screen.getByTestId('a').props.children).toBe('loading')
    expect(latest.a.isFetching).toBe(true)
    d.resolve('hello')
    await flush()
    expect(screen.getByTestId('a').props.children).toBe('hello')
    expect(latest.a.isLoading).toBe(false)
    expect(latest.a.isFetching).toBe(false)
    expect(latest.a.error).toBeNull()
  })

  it('dedupes concurrent fetches for the same key', async () => {
    const d = deferred<string>()
    const fetcher = jest.fn(() => d.promise)
    render(
      <>
        <Reader id="a" qkey="k" fetcher={fetcher} />
        <Reader id="b" qkey="k" fetcher={fetcher} />
      </>,
    )
    const r1 = latest.a.refetch()
    const r2 = latest.b.refetch()
    expect(fetcher).toHaveBeenCalledTimes(1)
    d.resolve('x')
    await flush()
    await expect(r1).resolves.toBe('x')
    await expect(r2).resolves.toBe('x')
    expect(screen.getByTestId('a').props.children).toBe('x')
    expect(screen.getByTestId('b').props.children).toBe('x')
  })

  it('serves fresh cached data on remount without refetching', async () => {
    const fetcher = jest.fn(async () => 'v1')
    const view = render(<Reader id="a" qkey="k" fetcher={fetcher} staleMs={60_000} />)
    await flush()
    view.unmount()
    render(<Reader id="a" qkey="k" fetcher={fetcher} staleMs={60_000} />)
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('a').props.children).toBe('v1')
    expect(latest.a.isStale).toBe(false)
  })

  it('refetches a stale entry on mount, showing the cached data meanwhile', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000)
    let n = 0
    const fetcher = jest.fn(async () => `v${++n}`)
    const view = render(<Reader id="a" qkey="k" fetcher={fetcher} staleMs={10_000} />)
    await flush()
    view.unmount()
    now.mockReturnValue(1_000 + 10_001)
    render(<Reader id="a" qkey="k" fetcher={fetcher} staleMs={10_000} />)
    // Stale data stays on screen while the refetch runs — no spinner.
    expect(screen.getByTestId('a').props.children).toBe('v1')
    expect(latest.a.isLoading).toBe(false)
    expect(latest.a.isFetching).toBe(true)
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('a').props.children).toBe('v2')
    now.mockRestore()
  })

  it('refetch() without force skips a fresh key; force always fetches', async () => {
    const fetcher = jest.fn(async () => 'v')
    render(<Reader id="a" qkey="k" fetcher={fetcher} staleMs={60_000} />)
    await flush()
    await act(async () => {
      await latest.a.refetch()
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    await act(async () => {
      await latest.a.refetch({ force: true })
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('a failed refetch keeps the last good data and sets error', async () => {
    let fail = false
    const fetcher = jest.fn(async () => {
      if (fail) throw { message: 'network down', code: 'PGRST' }
      return 'good'
    })
    render(<Reader id="a" qkey="k" fetcher={fetcher} />)
    await flush()
    fail = true
    let result: string | undefined = 'unset'
    await act(async () => {
      result = await latest.a.refetch({ force: true })
    })
    expect(result).toBeUndefined()
    expect(screen.getByTestId('a').props.children).toBe('good')
    expect(latest.a.error).toBeInstanceOf(Error)
    expect(latest.a.error?.message).toBe('network down')
    expect(latest.a.isLoading).toBe(false)

    fail = false
    await act(async () => {
      await latest.a.refetch({ force: true })
    })
    expect(latest.a.error).toBeNull()
  })

  it('a first-load failure ends isLoading so the screen can show the error', async () => {
    render(<Reader id="a" qkey="k" fetcher={async () => { throw new Error('boom') }} />)
    await flush()
    expect(latest.a.isLoading).toBe(false)
    expect(latest.a.data).toBeUndefined()
    expect(latest.a.error?.message).toBe('boom')
  })

  it('is idle for a null key or enabled: false', async () => {
    const fetcher = jest.fn(async () => 'x')
    render(
      <>
        <Reader id="a" qkey={null} fetcher={fetcher} />
        <Reader id="b" qkey="k" fetcher={fetcher} enabled={false} />
      </>,
    )
    await flush()
    expect(fetcher).not.toHaveBeenCalled()
    expect(latest.a.isLoading).toBe(false)
    expect(latest.b.isLoading).toBe(false)
    await expect(latest.b.refetch({ force: true })).resolves.toBeUndefined()
  })

  it('a stale in-flight response cannot overwrite a newer forced fetch', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const queue = [first, second]
    const fetcher = jest.fn(() => queue.shift()!.promise)
    render(<Reader id="a" qkey="k" fetcher={fetcher} />)
    act(() => {
      void latest.a.refetch({ force: true })
    })
    second.resolve('new')
    await flush()
    first.resolve('old')
    await flush()
    expect(screen.getByTestId('a').props.children).toBe('new')
  })
})

describe('invalidate', () => {
  it('refetches keys with a mounted reader and only marks the rest stale', async () => {
    const active = jest.fn(async () => 'a')
    const inactive = jest.fn(async () => 'b')
    render(<Reader id="mounted" qkey="event:1" fetcher={active} />)
    const view = render(<Reader id="gone" qkey="event:1:comments" fetcher={inactive} />)
    await flush()
    view.unmount()

    act(() => invalidate('event:1'))
    await flush()
    expect(active).toHaveBeenCalledTimes(2)
    expect(inactive).toHaveBeenCalledTimes(1)

    // The unmounted key refetches when it's next read.
    render(<Reader id="gone" qkey="event:1:comments" fetcher={inactive} />)
    await flush()
    expect(inactive).toHaveBeenCalledTimes(2)
  })

  it('matches whole segments only', async () => {
    const one = jest.fn(async () => '1')
    const ten = jest.fn(async () => '10')
    render(
      <>
        <Reader id="a" qkey="event:1" fetcher={one} />
        <Reader id="b" qkey="event:10" fetcher={ten} />
      </>,
    )
    await flush()
    act(() => invalidate('event:1'))
    await flush()
    expect(one).toHaveBeenCalledTimes(2)
    expect(ten).toHaveBeenCalledTimes(1)
  })

  it('refetchActive: false marks stale without fetching', async () => {
    const fetcher = jest.fn(async () => 'x')
    render(<Reader id="a" qkey="k" fetcher={fetcher} />)
    await flush()
    act(() => invalidate('k', { refetchActive: false }))
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(latest.a.isStale).toBe(true)
  })

  it('a disabled reader is not refetched', async () => {
    setQueryData('k', 'seeded')
    const fetcher = jest.fn(async () => 'x')
    render(<Reader id="a" qkey="k" fetcher={fetcher} enabled={false} />)
    act(() => invalidate('k'))
    await flush()
    expect(fetcher).not.toHaveBeenCalled()
    expect(screen.getByTestId('a').props.children).toBe('seeded')
  })

})

describe('setQueryData / getQueryData / removeQueries', () => {
  it('writes through to mounted readers and supports updater functions', async () => {
    render(<Reader id="a" qkey="k" fetcher={async () => 'server'} />)
    await flush()
    act(() => setQueryData<string>('k', prev => `${prev}+local`))
    expect(screen.getByTestId('a').props.children).toBe('server+local')
    expect(getQueryData<string>('k')).toBe('server+local')
  })

  it('seeded data counts as fresh, so a mount does not fetch', async () => {
    setQueryData('k', 'seeded')
    const fetcher = jest.fn(async () => 'x')
    render(<Reader id="a" qkey="k" fetcher={fetcher} />)
    await flush()
    expect(fetcher).not.toHaveBeenCalled()
    expect(screen.getByTestId('a').props.children).toBe('seeded')
  })

  it('removeQueries drops cached data under the prefix', async () => {
    setQueryData('me:profile', 'p')
    setQueryData('me:clubs', 'c')
    setQueryData('event:1', 'e')
    removeQueries('me')
    expect(getQueryData('me:profile')).toBeUndefined()
    expect(getQueryData('me:clubs')).toBeUndefined()
    expect(getQueryData('event:1')).toBe('e')
  })
})

describe('useMutation', () => {
  let mutation: MutationResult<string, string>

  function Mutator({
    fn,
    onError,
    invalidates,
  }: {
    fn: (v: string) => Promise<string>
    onError?: (e: Error) => void
    invalidates?: string[]
  }) {
    mutation = useMutation<string, string>(fn, {
      onMutate: v => {
        const prev = getQueryData<string[]>('list')
        setQueryData<string[]>('list', old => [...(old ?? []), v])
        return () => setQueryData('list', prev ?? [])
      },
      onError,
      invalidates,
    })
    return <Text testID="pending">{String(mutation.isPending)}</Text>
  }

  function ListReader({ fetcher }: { fetcher: () => Promise<string[]> }) {
    const q = useQuery<string[]>('list', fetcher)
    return <Text testID="list">{(q.data ?? []).join(',')}</Text>
  }

  it('applies the optimistic update and rolls it back on error', async () => {
    setQueryData('list', ['a'])
    const onError = jest.fn()
    const d = deferred<string>()
    render(
      <>
        <ListReader fetcher={async () => ['a']} />
        <Mutator fn={() => d.promise} onError={onError} />
      </>,
    )
    let result: Promise<string | undefined>
    act(() => {
      result = mutation.mutate('b')
    })
    expect(screen.getByTestId('list').props.children).toBe('a,b')
    expect(screen.getByTestId('pending').props.children).toBe('true')

    d.reject(new Error('insert failed'))
    await act(async () => {
      await expect(result).resolves.toBeUndefined()
    })
    expect(screen.getByTestId('list').props.children).toBe('a')
    expect(mutation.error?.message).toBe('insert failed')
    expect(mutation.isPending).toBe(false)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('ignores a second mutate while the first is pending', async () => {
    setQueryData('list', [])
    const d = deferred<string>()
    const fn = jest.fn(() => d.promise)
    render(<Mutator fn={fn} />)
    let first: Promise<string | undefined>
    let second: Promise<string | undefined>
    act(() => {
      first = mutation.mutate('x')
      second = mutation.mutate('x')
    })
    expect(fn).toHaveBeenCalledTimes(1)
    await expect(second!).resolves.toBeUndefined()
    d.resolve('ok')
    await act(async () => {
      await expect(first).resolves.toBe('ok')
    })
    // Pending cleared: a new submit goes through.
    await act(async () => {
      void mutation.mutate('y')
    })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('invalidates the listed prefixes after success', async () => {
    const fetcher = jest.fn(async () => ['server'])
    render(
      <>
        <ListReader fetcher={fetcher} />
        <Mutator fn={async v => v} invalidates={['list']} />
      </>,
    )
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(1)
    await act(async () => {
      await mutation.mutate('z')
    })
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('list').props.children).toBe('server')
  })
})

describe('invalidate with no active reader', () => {
  it('retires an in-flight fetch so its late response cannot clear the stale flag', async () => {
    const { invalidate, setQueryData, getQueryData, useQuery } = require('../lib/query')
    const { renderHook } = require('@testing-library/react-native')
    const key = 'event:late'
    let resolve!: (v: string) => void
    const fetcher = jest.fn(() => new Promise<string>(r => { resolve = r }))
    const h = renderHook(() => useQuery(key, fetcher, { staleMs: 60_000 }))
    expect(fetcher).toHaveBeenCalledTimes(1)
    h.unmount()
    setQueryData(key, 'edited') // a write elsewhere
    invalidate(key)             // no active reader: no refetch, but the old fetch must be retired
    resolve('pre-edit')
    await Promise.resolve(); await Promise.resolve()
    expect(getQueryData(key)).toBe('edited')
  })
})

describe('useQueries (#343)', () => {
  let many: QueryResult<string>[] = []
  let renders = 0
  function ManyReader({ keys, fetcher, staleMs }: { keys: string[]; fetcher: (key: string, i: number) => Promise<string>; staleMs?: number }) {
    many = useQueries<string>(keys, fetcher, { staleMs })
    renders++
    return <Text testID="many">{many.map(q => q.data ?? (q.isLoading ? 'loading' : 'empty')).join(',')}</Text>
  }
  beforeEach(() => { many = []; renders = 0 })

  it('reads one result per key, in order, and fetches each key once', async () => {
    const fetcher = jest.fn((key: string, _index: number) => Promise.resolve(`v-${key}`))
    render(<ManyReader keys={['m:1', 'm:2']} fetcher={fetcher} />)
    expect(screen.getByTestId('many').props.children).toBe('loading,loading')
    await flush()
    expect(screen.getByTestId('many').props.children).toBe('v-m:1,v-m:2')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls.map(c => c[1])).toEqual([0, 1])
  })

  it('grows and shrinks with the key list, fetching only the new key', async () => {
    const fetcher = jest.fn((key: string) => Promise.resolve(`v-${key}`))
    const view = render(<ManyReader keys={['m:1']} fetcher={fetcher} />)
    await flush()
    view.rerender(<ManyReader keys={['m:1', 'm:2', 'm:3']} fetcher={fetcher} />)
    await flush()
    expect(screen.getByTestId('many').props.children).toBe('v-m:1,v-m:2,v-m:3')
    expect(fetcher).toHaveBeenCalledTimes(3)
    view.rerender(<ManyReader keys={['m:2']} fetcher={fetcher} />)
    await flush()
    expect(screen.getByTestId('many').props.children).toBe('v-m:2')
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('shares the cache and in-flight fetches with useQuery on the same key', async () => {
    const d = deferred<string>()
    const single = jest.fn(() => d.promise)
    const listed = jest.fn(() => Promise.resolve('never used'))
    render(<><Reader id="a" qkey="m:1" fetcher={single} /><ManyReader keys={['m:1']} fetcher={listed} /></>)
    await act(async () => d.resolve('one'))
    await flush()
    expect(single).toHaveBeenCalledTimes(1)
    expect(listed).not.toHaveBeenCalled()
    expect(many[0].data).toBe('one')
  })

  it('a failed refetch keeps the last good data and sets error on that key only', async () => {
    let fail = false
    const fetcher = jest.fn((key: string) => (fail && key === 'm:2' ? Promise.reject(new Error('boom')) : Promise.resolve(`v-${key}`)))
    render(<ManyReader keys={['m:1', 'm:2']} fetcher={fetcher} />)
    await flush()
    fail = true
    await act(async () => { await many[1].refetch({ force: true }) })
    expect(many[1].data).toBe('v-m:2')
    expect(many[1].error?.message).toBe('boom')
    expect(many[0].error).toBeNull()
  })

  it('invalidate refetches through a mounted list reader', async () => {
    let n = 0
    const fetcher = jest.fn((key: string) => Promise.resolve(`${key}#${++n}`))
    render(<ManyReader keys={['m:1', 'm:2']} fetcher={fetcher} />)
    await flush()
    act(() => invalidate('m:2'))
    await flush()
    expect(many.map(q => q.data)).toEqual(['m:1#1', 'm:2#3'])
  })

  it('does not re-render for an equal key list or for writes to other keys', async () => {
    const fetcher = (key: string) => Promise.resolve(`v-${key}`)
    const view = render(<ManyReader keys={['m:1']} fetcher={fetcher} />)
    await flush()
    const before = renders
    act(() => setQueryData('other', 'x'))
    expect(renders).toBe(before)
    view.rerender(<ManyReader keys={['m:1']} fetcher={fetcher} />)
    await flush()
    expect(renders).toBe(before + 1)
    expect(getQueryData('m:1')).toBe('v-m:1')
  })
})
