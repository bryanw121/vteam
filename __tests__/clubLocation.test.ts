import { clubLocationFromPicker, clubMapsUrl, matchMajorCity, NO_CLUB_LOCATION, pickerFromClubLocation, placeAddress } from '../utils/clubLocation'
import type { MajorCity } from '../types'

const city = (display_name: string): MajorCity =>
  ({ id: display_name, display_name, city_name: display_name.split(',')[0], admin_region: display_name.split(', ')[1], country_code: 'US' })
const CATALOG = [city('Austin, TX'), city('Round Rock, TX'), city('Portland, OR'), city('Portland, ME')]

describe('placeAddress', () => {
  it('uses the secondary text without the country', () => {
    expect(placeAddress({ description: 'Gregory Gym, Speedway, Austin, TX, USA', structured_formatting: { main_text: 'Gregory Gym', secondary_text: 'Speedway, Austin, TX, USA' } }))
      .toBe('Speedway, Austin, TX')
  })
  it('falls back to the description', () => {
    expect(placeAddress({ description: '1100 Congress Ave, Austin, TX, United States', structured_formatting: { main_text: '', secondary_text: '' } }))
      .toBe('1100 Congress Ave, Austin, TX')
  })
})

describe('clubLocationFromPicker', () => {
  it('maps a Places pick to the clubs columns', () => {
    expect(clubLocationFromPicker({ display: 'Gregory Gym', name: 'Gregory Gym', address: 'Speedway, Austin, TX', latitude: 30.28, longitude: -97.73, placeId: 'ChIJ123' }))
      .toEqual({ location_name: 'Gregory Gym', location_address: 'Speedway, Austin, TX', latitude: 30.28, longitude: -97.73, place_id: 'ChIJ123' })
  })
  it('a curated venue keeps its address and has no coordinates or place id', () => {
    expect(clubLocationFromPicker({ display: 'Roots', name: 'Roots', address: '15407 Long Vista Dr Suite 100, Austin, TX 78728', latitude: null, longitude: null, placeId: null }))
      .toEqual({ location_name: 'Roots', location_address: '15407 Long Vista Dr Suite 100, Austin, TX 78728', latitude: null, longitude: null, place_id: null })
  })
  it('a cleared or missing value means no location', () => {
    expect(clubLocationFromPicker(null)).toEqual(NO_CLUB_LOCATION)
    expect(clubLocationFromPicker({ display: '  ', latitude: 1, longitude: 2 })).toEqual(NO_CLUB_LOCATION)
  })
  it('drops a half or out-of-range coordinate pair and caps long text', () => {
    const out = clubLocationFromPicker({ display: 'x'.repeat(250), latitude: 95, longitude: 10, address: 'a'.repeat(400) })
    expect(out.latitude).toBeNull()
    expect(out.longitude).toBeNull()
    expect(out.location_name).toHaveLength(200)
    expect(out.location_address).toHaveLength(300)
  })
  it('round-trips through the edit form', () => {
    const cols = clubLocationFromPicker({ display: 'Gregory Gym', name: 'Gregory Gym', address: 'Austin, TX', latitude: 30, longitude: -97, placeId: 'p' })
    expect(clubLocationFromPicker(pickerFromClubLocation(cols))).toEqual(cols)
    expect(pickerFromClubLocation(NO_CLUB_LOCATION)).toBeNull()
  })
})

describe('matchMajorCity', () => {
  it('finds the curated metro in an address', () => {
    expect(matchMajorCity('Speedway, Austin, TX', CATALOG)?.display_name).toBe('Austin, TX')
    expect(matchMajorCity('15407 Long Vista Dr Suite 100, Austin, TX 78728', CATALOG)?.display_name).toBe('Austin, TX')
    expect(matchMajorCity('100 Main St, round rock, tx', CATALOG)?.display_name).toBe('Round Rock, TX')
  })
  it('uses the state to tell same-named cities apart', () => {
    expect(matchMajorCity('Congress St, Portland, ME', CATALOG)?.display_name).toBe('Portland, ME')
  })
  it('returns null outside the curated list or without an address', () => {
    expect(matchMajorCity('Main St, Marfa, TX', CATALOG)).toBeNull()
    expect(matchMajorCity(null, CATALOG)).toBeNull()
    expect(matchMajorCity('Austin, TX', [])).toBeNull()
  })
})

describe('clubMapsUrl', () => {
  it('pins the exact place when there is a place id', () => {
    expect(clubMapsUrl({ location_name: 'Gregory Gym', location_address: 'Austin, TX', latitude: 30, longitude: -97, place_id: 'ChIJ 1' }))
      .toBe('https://www.google.com/maps/search/?api=1&query=Gregory%20Gym%2C%20Austin%2C%20TX&query_place_id=ChIJ%201')
  })
  it('uses coordinates, then text, otherwise', () => {
    expect(clubMapsUrl({ location_name: 'Park', location_address: null, latitude: 30.5, longitude: -97.25, place_id: null }))
      .toBe('https://www.google.com/maps/search/?api=1&query=30.5%2C-97.25')
    expect(clubMapsUrl({ location_name: 'Roots', location_address: 'Austin, TX', latitude: null, longitude: null, place_id: null }))
      .toBe('https://www.google.com/maps/search/?api=1&query=Roots%2C%20Austin%2C%20TX')
    expect(clubMapsUrl(NO_CLUB_LOCATION)).toBeNull()
  })
})
