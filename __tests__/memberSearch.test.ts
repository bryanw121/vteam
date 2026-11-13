import { searchMembers } from '../lib/memberSearch'

const mockRpc = jest.fn()
jest.mock('../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }))

const row = (id: string) => ({ id, username: id, first_name: null, last_name: null, avatar_url: null, position: null, created_at: 'x' })

beforeEach(() => mockRpc.mockReset())

describe('searchMembers (search_members RPC, rate limited server-side)', () => {
  it('skips the call for a blank term', async () => {
    expect(await searchMembers('   ')).toEqual([])
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('sends the trimmed term (escaping happens server-side) and drops excluded ids', async () => {
    mockRpc.mockResolvedValue({ data: [row('me'), row('a'), row('b')], error: null })
    const out = await searchMembers('  Smith, J. (50%)  ', { limit: 2, exclude: ['me', null] })
    expect(mockRpc).toHaveBeenCalledWith('search_members', { p_query: 'Smith, J. (50%)', p_limit: 3 })
    expect(out.map(r => r.id)).toEqual(['a', 'b'])
    expect(out[0].position).toEqual([])
  })

  it('throws the server error (e.g. 429 Too many requests) for the caller to show', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PT429', message: 'Too many requests. Please wait a moment and try again.' } })
    await expect(searchMembers('bo')).rejects.toMatchObject({ code: 'PT429' })
  })
})
