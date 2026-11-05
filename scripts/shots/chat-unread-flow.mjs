#!/usr/bin/env node
/**
 * Chat tab badge in the real web export, with every Supabase call mocked (#146):
 * opening a conversation takes its unread count off the badge without a reload,
 * the badge stays there once the read is saved and the list is recounted, and a
 * reload agrees. Desktop (sidebar) and mobile (tab bar).
 *
 *   node scripts/shots/chat-unread-flow.mjs --dist dist-mock [--out shots/chat-unread]
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect } from '@playwright/test'
import { launchChromium, parseArgs } from './capture.mjs'
import { serveDist } from './lib/server.mjs'
import { installSupabaseMock } from './lib/supabaseMock.mjs'
import { loadRelationships, loadSeenIds } from './lib/schema.mjs'
import { defaultNow } from './fixtures/time.mjs'
import { IDS, ME } from './fixtures/index.mjs'

const args = parseArgs(process.argv.slice(2))
const out = resolve(args.out || 'shots/chat-unread')
const DM = IDS.conversation.jordan
const report = []
await mkdir(out, { recursive: true })
const server = await serveDist(resolve(args.dist || 'dist'))
let browser

/** Unread messages for the viewer in one conversation, from the mock's own rows (what the server would count). */
function serverUnread(db, conversationId) {
  const me = db.rowsOf('conversation_members').find(m => m.conversation_id === conversationId && m.user_id === ME)
  return db.rowsOf('messages').filter(m => m.conversation_id === conversationId && m.sender_id !== ME && (!me.last_read_at || m.created_at > me.last_read_at)).length
}

/** The visible badge's number, or 0 when no badge is shown. */
async function badgeCount(page) {
  const badge = page.getByTestId('chat-unread-badge').filter({ visible: true })
  if (await badge.count() === 0) return 0
  return Number((await badge.first().innerText()).trim())
}

try {
  browser = await launchChromium()
  for (const [surface, viewport] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, timezoneId: 'America/Chicago', locale: 'en-US' })
    const now = defaultNow()
    await context.clock.install({ time: now })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    try {
      const { db } = await installSupabaseMock(page, { now, signedIn: true, seenIds: loadSeenIds(process.cwd()), relationships: loadRelationships(process.cwd()) })
      const total = () => db.rowsOf('conversation_members').filter(m => m.user_id === ME).reduce((n, m) => n + serverUnread(db, m.conversation_id), 0)
      const inDm = serverUnread(db, DM)
      const before = total()
      assert.ok(inDm > 0, `${surface}: fixture DM has no unread messages`)

      await page.goto(`${server.url}/chat`, { waitUntil: 'load' })
      await expect.poll(() => badgeCount(page), { timeout: 20000, message: `${surface}: badge on load` }).toBe(before)

      // Open the DM from the list (no reload): its count leaves the badge.
      await page.getByText('Jordan', { exact: false }).first().click()
      await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible({ timeout: 20000 })
      // The room marks the conversation read once its messages show (debounced 1s).
      await expect.poll(() => serverUnread(db, DM), { timeout: 10000, message: `${surface}: the read was not saved` }).toBe(0)
      if (surface === 'mobile') await page.goBack() // the tab bar is on the list, not in the room
      await expect.poll(() => badgeCount(page), { timeout: 10000, message: `${surface}: badge after opening the DM` }).toBe(before - inDm)

      // Once the read is saved the list is recounted: the count must not come back.
      await page.waitForTimeout(3000)
      assert.equal(await badgeCount(page), before - inDm, `${surface}: ghost badge after the recount`)

      await page.reload({ waitUntil: 'load' })
      await expect.poll(() => badgeCount(page), { timeout: 20000, message: `${surface}: badge after reload` }).toBe(before - inDm)
      await page.screenshot({ path: resolve(out, `${surface}.png`) })
      assert.deepEqual(errors, [], `${surface}: page errors`)
      report.push({ surface, before, inDm, after: before - inDm, ok: true })
      console.log(`  chat-unread ${surface}: ${before} → ${before - inDm} (stays after recount and reload)`)
    } finally {
      await context.close()
    }
  }
} finally {
  await browser?.close()
  await server.close()
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2))
}
