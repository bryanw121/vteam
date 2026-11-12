// Runs the calendar-date tests under several time zones (cross-platform
// replacement for the old bash loop in package.json).
import { spawnSync } from 'node:child_process'

const zones = ['America/Chicago', 'America/Denver', 'Europe/Berlin', 'Asia/Tokyo', 'UTC']
for (const tz of zones) {
  console.log(`── TZ=${tz} ──`)
  const r = spawnSync('npx', ['jest', '__tests__/calendarDates.test.ts'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, TZ: tz },
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
