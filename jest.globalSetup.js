// Pins the test time zone. Lives here rather than as `TZ=... jest` in
// package.json because Windows' cmd cannot run that syntax. Jest starts its
// workers after this runs, so they inherit it. An explicit TZ (see
// scripts/test-timezones.mjs) still wins.
module.exports = () => {
  if (!process.env.TZ) process.env.TZ = 'America/Chicago'
}
