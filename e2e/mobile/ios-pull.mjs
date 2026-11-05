// Real Mobile Safari (iOS Simulator) pull-to-refresh check, #35, through Appium's
// XCUITest driver. The swipe is a W3C touch action in the NATIVE_APP context,
// i.e. a real touch on the simulator screen, so Safari's own scrolling,
// rubber-banding and gestures all run.
//
//   npx appium &   then   IOS_DEVICE="iPhone 16" node e2e/mobile/ios-pull.mjs
//
// Needs webdriverio (installed by the workflow, not a project dependency).
// Exits non-zero on the first failed check; screenshots go to test-results/mobile/.
import { mkdirSync, writeFileSync } from 'node:fs'
import { remote } from 'webdriverio'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8081'
const OUT = 'test-results/mobile'
mkdirSync(OUT, { recursive: true })

const options = {
  hostname: '127.0.0.1',
  port: 4723,
  logLevel: 'warn',
  // A cold simulator plus a WebDriverAgent build can take several minutes to open a session.
  connectionRetryTimeout: 900_000,
  connectionRetryCount: 0,
  capabilities: {
    platformName: 'iOS',
    browserName: 'Safari',
    'appium:automationName': 'XCUITest',
    'appium:deviceName': process.env.IOS_DEVICE || 'iPhone 16',
    ...(process.env.IOS_VERSION ? { 'appium:platformVersion': process.env.IOS_VERSION } : {}),
    // The exact simulator the workflow booted: runners carry several with the same name.
    ...(process.env.IOS_UDID ? { 'appium:udid': process.env.IOS_UDID } : {}),
    'appium:simulatorStartupTimeout': 600_000,
    'appium:wdaLaunchTimeout': 300_000,
    'appium:newCommandTimeout': 300,
  },
}

// The first session on a cold runner builds and launches WebDriverAgent, which
// can outlast the HTTP client's socket (~5 min). By then WDA is built, so one
// retry is fast; a second failure is real.
async function openSession() {
  try {
    return await remote(options)
  } catch (e) {
    console.log(`session attempt 1 failed (${e.message.split('\n')[0]}); retrying once`)
    return remote(options)
  }
}
const browser = await openSession()

const restCalls = () => browser.execute(() =>
  performance.getEntriesByType('resource').filter(e => e.name.includes('/rest/v1/')).length)
async function waitFor(fn, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 300)) }
  return false
}

/** A real finger swipe on the simulator, from/to as fractions of the screen height. */
async function swipeDown(from, to) {
  const web = await browser.getContext()
  await browser.switchContext('NATIVE_APP')
  const { width, height } = await browser.getWindowSize()
  await browser.action('pointer', { parameters: { pointerType: 'touch' } })
    .move({ x: Math.round(width / 2), y: Math.round(height * from) })
    .down()
    .pause(80)
    .move({ x: Math.round(width / 2), y: Math.round(height * to), duration: 700 })
    .up()
    .perform()
  await browser.switchContext(web)
}

let failed = false
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) failed = true }
const shot = async name => writeFileSync(`${OUT}/${name}.png`, Buffer.from(await browser.takeScreenshot(), 'base64'))
try {
  await browser.url(`${BASE}/`)
  await browser.$('[data-testid="filter-all"]').waitForExist({ timeout: 120_000 })
  await new Promise(r => setTimeout(r, 4000)) // first load settles
  await browser.execute(() => { window.__noReload = true })

  let before = await restCalls()
  await swipeDown(0.35, 0.8)
  check(await waitFor(async () => (await restCalls()) > before, 15_000), 'pull at top refetches the feed')
  check(await browser.execute(() => window.__noReload === true), 'the page was not reloaded')
  await shot('ios-after-pull')

  await new Promise(r => setTimeout(r, 3000))
  before = await restCalls()
  await swipeDown(0.35, 0.4)
  await new Promise(r => setTimeout(r, 2500))
  check((await restCalls()) === before, 'short pull below the threshold does not refetch')

  await browser.execute(() => { document.body.style.minHeight = '6000px'; window.scrollTo(0, 800) })
  await new Promise(r => setTimeout(r, 500))
  const yBefore = await browser.execute(() => window.scrollY)
  before = await restCalls()
  await swipeDown(0.35, 0.8)
  await new Promise(r => setTimeout(r, 2500))
  const yAfter = await browser.execute(() => window.scrollY)
  console.log(`mid-scroll: scrollY ${yBefore} -> ${yAfter}`)
  check(yBefore > 0, 'the page was scrolled before the mid-scroll pull')
  check((await restCalls()) === before, 'pull mid-scroll does not refetch')
  check(yAfter < yBefore, 'pull mid-scroll scrolled the page up instead')
} finally {
  await shot('ios-final').catch(() => {})
  await browser.deleteSession()
}
if (failed) process.exit(1)
