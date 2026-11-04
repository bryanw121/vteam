import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The venue picker's e2e tests mock `places-proxy` outright, so nothing in the
 * Playwright suite can see the edge function's own query parameters. These
 * guards cover that blind spot.
 *
 * The bug they exist for: the proxy sent `types=establishment`. The legacy
 * Autocomplete API accepts exactly ONE type collection and they cannot be
 * combined, so street addresses were impossible to return — searching
 * "1100 Congress Ave" found nothing while "Gregory Gym" worked.
 */

const proxy = readFileSync(
  join(__dirname, '..', 'supabase/functions/places-proxy/handler.ts'),
  'utf8',
)

/** The autocomplete branch only, so a `types` string elsewhere can't mask a regression. */
const autocompleteParams = proxy.match(
  /action === 'autocomplete'[\s\S]*?new URLSearchParams\(\{([\s\S]*?)\}\)/,
)?.[1]

describe('places-proxy autocomplete request', () => {
  it('builds its parameters from a recognisable URLSearchParams block', () => {
    // Guards the guards: if this parse fails, the assertions below would pass
    // vacuously against `undefined`.
    expect(autocompleteParams).toBeDefined()
    expect(autocompleteParams).toMatch(/input:/)
  })

  it('sets no `types` filter, so addresses and establishments both return', () => {
    expect(autocompleteParams).not.toMatch(/\btypes\s*:/)
  })

  it('still restricts to the US and biases toward the configured centre', () => {
    expect(autocompleteParams).toMatch(/components:\s*'country:us'/)
    expect(autocompleteParams).toMatch(/location:\s*LOCATION/)
    expect(autocompleteParams).toMatch(/radius:\s*RADIUS/)
  })

  it('passes the session token through, which is what keeps billing to one session', () => {
    expect(autocompleteParams).toMatch(/sessiontoken:\s*body\.sessiontoken/)
  })
})

describe('places-proxy details request', () => {
  const detailsParams = proxy.match(
    /action === 'details'[\s\S]*?new URLSearchParams\(\{([\s\S]*?)\}\)/,
  )?.[1]

  it('requests only `geometry`, the narrowest Basic-Data field set', () => {
    expect(detailsParams).toBeDefined()
    expect(detailsParams).toMatch(/fields:\s*'geometry'/)
  })

  it('reuses the same session token so autocomplete and details bill as one session', () => {
    expect(detailsParams).toMatch(/sessiontoken:\s*body\.sessiontoken/)
  })
})
