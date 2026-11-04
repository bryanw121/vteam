/**
 * Google Places mock for e2e.
 *
 * The app never calls maps.googleapis.com from the client — LocationPickerField
 * posts to the `places-proxy` Supabase edge function, which holds GOOGLE_MAPS_KEY
 * server-side. So the interception seam is that function, not Google, and the
 * fulfilled body is the raw Google response shape the function passes through
 * verbatim (see supabase/functions/places-proxy/handler.ts).
 *
 * Without this, any test that types into the venue picker spends real Google
 * Places quota — autocomplete is billed per session and details per request.
 */
import type { Page } from '@playwright/test'

export const MOCK_PLACE_ID = 'e2e-mock-place-1'
export const MOCK_VENUE_NAME = 'Mock Volleyball Center'
export const MOCK_VENUE_REGION = 'Austin, TX'
/** Deliberately not the proxy's Austin bias centre, so a hardcoded default can't pass. */
export const MOCK_VENUE_COORDS = { lat: 30.401234, lng: -97.712345 }

/**
 * A street-address prediction. The proxy used to send `types=establishment`,
 * which made this shape impossible to receive at all — so a test that selects
 * it is the regression guard for that config never coming back.
 */
export const MOCK_ADDRESS_PLACE_ID = 'e2e-mock-place-2'
export const MOCK_ADDRESS_MAIN = '1100 Congress Ave'
export const MOCK_ADDRESS_SECONDARY = 'Austin, TX, USA'
/** What formatVenueDisplay must store: street line plus city, no state or country. */
export const MOCK_ADDRESS_SAVED = '1100 Congress Ave, Austin'
export const MOCK_ADDRESS_COORDS = { lat: 30.274567, lng: -97.740345 }

export type ProxyCall = {
  action: string
  input?: string
  place_id?: string
  sessiontoken: string
}

/**
 * Route every places-proxy call to a canned response. Returns the array the
 * handler records into, so a test can assert which actions were exercised and
 * that autocomplete + details shared one billing session token.
 *
 * Note on CORS: supabase-js sends Authorization/apikey/x-client-info, so the
 * browser issues a preflight before the POST. The OPTIONS branch below answers
 * it if Playwright surfaces it to the route handler; if it doesn't, the
 * preflight reaches the deployed function, which answers from its own OPTIONS
 * branch and returns before any Google call. Either way the billable POST is
 * fulfilled here and Google is never reached.
 */
export async function mockPlacesProxy(page: Page): Promise<ProxyCall[]> {
  const calls: ProxyCall[] = []

  await page.route('**/functions/v1/places-proxy', async route => {
    const request = route.request()

    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        },
        body: 'ok',
      })
      return
    }

    const body = request.postDataJSON() as ProxyCall
    calls.push(body)

    const payload = body.action === 'autocomplete'
      ? {
          status: 'OK',
          predictions: [
            {
              place_id: MOCK_PLACE_ID,
              description: `${MOCK_VENUE_NAME}, ${MOCK_VENUE_REGION}`,
              types: ['establishment', 'point_of_interest'],
              structured_formatting: {
                main_text: MOCK_VENUE_NAME,
                secondary_text: MOCK_VENUE_REGION,
              },
            },
            {
              place_id: MOCK_ADDRESS_PLACE_ID,
              description: `${MOCK_ADDRESS_MAIN}, ${MOCK_ADDRESS_SECONDARY}`,
              // The shape the live proxy actually returns for a street address —
              // an invented ['street_address','geocode'] hid a premise-handling bug.
              types: ['geocode', 'premise'],
              structured_formatting: {
                main_text: MOCK_ADDRESS_MAIN,
                secondary_text: MOCK_ADDRESS_SECONDARY,
              },
            },
          ],
        }
      : {
          status: 'OK',
          result: {
            geometry: {
              location: body.place_id === MOCK_ADDRESS_PLACE_ID ? MOCK_ADDRESS_COORDS : MOCK_VENUE_COORDS,
            },
          },
        }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(payload),
    })
  })

  return calls
}

export async function unmockPlacesProxy(page: Page): Promise<void> {
  await page.unroute('**/functions/v1/places-proxy')
}

/**
 * The picker caches predictions in AsyncStorage under `gmaps:<v>:<query>` and in
 * a module-level Map. The Map dies with the page, but the storageState the
 * chromium project loads could carry a stale entry from an earlier run, and a
 * cache hit skips the proxy call entirely — which would make the mock assertions
 * vacuously pass. Clear it before typing.
 */
export async function clearPlacesCache(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.includes('gmaps:')) window.localStorage.removeItem(key)
    }
  })
}
