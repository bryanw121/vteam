import { allowScan, normalizeRoster, openaiPayload, parseScanRequest, rosterFromCompletion } from '../supabase/functions/_shared/rosterScan'

describe('read-roster helpers', () => {
  it('validates the request', () => {
    expect(parseScanRequest(null)).toMatch(/body/)
    expect(parseScanRequest({ image: '' })).toMatch(/required/)
    expect(parseScanRequest({ image: 'abc$%', mime: 'image/jpeg' })).toMatch(/base64/)
    expect(parseScanRequest({ image: 'QUJD', mime: 'image/gif' })).toMatch(/unsupported/)
    expect(parseScanRequest({ image: 'QU JD\n', mime: 'IMAGE/PNG' })).toEqual({ image: 'QUJD', mime: 'image/png' })
  })

  it('asks for structured JSON with the photo inline', () => {
    const body = openaiPayload({ image: 'QUJD', mime: 'image/jpeg' })
    expect(body.response_format.type).toBe('json_schema')
    const content = body.messages[1].content as { type: string; image_url?: { url: string } }[]
    expect(content[1].image_url?.url).toBe('data:image/jpeg;base64,QUJD')
  })

  it('cleans the model output', () => {
    expect(normalizeRoster({
      teamName: '  Aces <b> ',
      players: [
        { number: 7, name: ' Jane   Doe ', libero: false, captain: true },
        { number: 7, name: 'Duplicate', libero: false, captain: false },
        { number: 120, name: 'Too big', libero: false, captain: false },
        { number: '12', name: null, libero: true, captain: false },
        'junk',
      ],
    })).toEqual({ teamName: 'Aces b', players: [{ number: 7, name: 'Jane Doe', captain: true }, { number: 12, libero: true }] })
    expect(rosterFromCompletion({ choices: [{ message: { content: 'not json' } }] })).toEqual({ teamName: null, players: [] })
    expect(rosterFromCompletion({ choices: [{ message: { content: '{"teamName":null,"players":[{"number":3,"name":"Ana","libero":false,"captain":false}]}' } }] }).players).toEqual([{ number: 3, name: 'Ana' }])
  })

  it('rate limits per user per hour', () => {
    const log = new Map<string, number[]>()
    for (let i = 0; i < 3; i++) expect(allowScan(log, 'u', 1000 + i, 3)).toBe(true)
    expect(allowScan(log, 'u', 2000, 3)).toBe(false)
    expect(allowScan(log, 'other', 2000, 3)).toBe(true)
    expect(allowScan(log, 'u', 1000 + 60 * 60_000 + 5, 3)).toBe(true)
  })
})
