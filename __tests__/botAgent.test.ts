import { currentChromeMajor, isBotAgent } from '../utils/botAgent'

/** #331: crawler-like browsers are labelled in metrics, people never are. */
const NOW = Date.UTC(2026, 10, 20)

const PEOPLE = [
  // iPhone Safari (the main vteam device), iPad, Android Chrome, desktop Chrome / Edge / Firefox / Safari.
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/155.0.7000.20 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.7100.40 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15',
  // Samsung Internet reports an older Chromium on purpose.
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
]

const BOTS = [
  // The four first visits recorded since #326 (live edge logs, Nov 18–19 2026).
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.5938.132 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.60 Safari/537.36 Edge/12.246',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.0 Safari/537.36',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
]

describe('isBotAgent', () => {
  it.each(PEOPLE)('a person: %s', ua => expect(isBotAgent(ua, NOW)).toBe(false))
  it.each(BOTS)('a crawler: %s', ua => expect(isBotAgent(ua, NOW)).toBe(true))

  it('no agent (native, static render) is not a bot', () => {
    expect(isBotAgent(null, NOW)).toBe(false)
    expect(isBotAgent('', NOW)).toBe(false)
  })

  it('estimates the current Chrome a little low, so new releases never look old', () => {
    expect(currentChromeMajor(Date.UTC(2024, 10, 12))).toBe(131)
    // Chrome 143 shipped in early December 2025.
    expect(currentChromeMajor(Date.UTC(2025, 11, 10))).toBeLessThanOrEqual(143)
    // A browser one year behind is still a person.
    expect(isBotAgent('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36', NOW)).toBe(false)
  })
})
