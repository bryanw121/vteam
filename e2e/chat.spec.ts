/**
 * Chat E2E tests — requires the Expo dev server to be running on port 8081.
 * Run: npx playwright test e2e/chat.spec.ts
 *
 * Test account: E2E_USERNAME / E2E_PASSWORD (see .env.example)
 * Seed conversation: the e2e account's DM with @e2ebuddy (id: 1e473b01-c06a-48b0-9308-21b3f593f603).
 * It must belong to the E2E_USERNAME account: the compose test expects picking
 * @e2ebuddy to open exactly this conversation.
 */

import { test, expect, Page } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'
import { gotoReady } from './retry'

const CONVO_ID = '1e473b01-c06a-48b0-9308-21b3f593f603'
const CONVO_URL = `${BASE_URL}/chat/${CONVO_ID}`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Close the Expo dev-server error overlay (its button reads exactly "Dismiss").
 * Must be an exact match: a substring match also hits app content — e.g. the
 * chat list preview "You: e2e-reply-dismiss-<ts>" left by the reply-banner test
 * below — and clicking that row opened the conversation, leaving the list as a
 * hidden stack screen underneath (chatHeader then resolved to its hidden title).
 */
async function dismissErrorOverlays(page: Page) {
  const dismissBtns = await page.getByText('Dismiss', { exact: true }).all()
  for (const btn of dismissBtns) {
    try { await btn.click({ timeout: 500 }) } catch {}
  }
}

/**
 * Open the seed conversation and dismiss the "unsportsmanlike language" report
 * modal if it appears — the seed conversation contains old messages that trip
 * the DM bad-word detector, and the modal blocks all further interaction.
 */
async function gotoConversation(page: Page) {
  // Wait for the composer to mount (screen ready) rather than a fixed sleep —
  // the dev server + a long message history can take a while. A load that hit
  // a Supabase "Failed to fetch" is reloaded once (e2e/retry.ts).
  await gotoReady(page, CONVO_URL, page.getByRole('textbox', { name: 'Message' }), { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const modal = page.getByText('This player may be unsportsmanlike', { exact: false })
  if (await modal.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Close' }).click({ force: true }).catch(() => {})
    await page.waitForTimeout(400)
  }
}

/**
 * The chat screen's "Chat" title. `getByText('Chat')` alone is ambiguous:
 * it also matches the sidebar nav item and (substring, case-insensitive) any
 * conversation preview containing "chat". exact:true excludes previews; the
 * sidebar renders first in the DOM, so nth(1) is the screen header.
 */
function chatHeader(page: Page) {
  return page.getByText('Chat', { exact: true }).nth(1)
}

/**
 * The virtualized web message list (react-virtuoso, #3): how far it is from
 * the bottom, and how many message rows are actually in the DOM.
 */
async function listState(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-testid="chat-message-list"]')
    if (!el) return null
    return {
      fromBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      rows: el.querySelectorAll('[data-index]').length,
      // data-index counts from the oldest LOADED message, so it shifts by a page when one is prepended.
      minIndex: Math.min(...Array.from(el.querySelectorAll('[data-index]')).map(r => Number(r.getAttribute('data-index')))),
      maxIndex: Math.max(...Array.from(el.querySelectorAll('[data-index]')).map(r => Number(r.getAttribute('data-index')))),
    }
  })
}

/** Right-click a message bubble and open the context menu. */
async function openContextMenu(page: Page, messageText: string) {
  // Wait for the message to actually render (message history loads async and
  // can be slow); .last() targets the bubble when a reply quote also matches
  const target = page.getByText(messageText).last()
  await target.waitFor({ state: 'visible', timeout: 20000 })
  // The app intentionally ignores right-click while a message is still in its
  // optimistic `_sending` state (MessageBubble.openActionMenu), and a freshly
  // sent message can take several seconds to confirm on a slow CI↔Supabase
  // link. A single forced click + fixed sleep races that guard — the historic
  // cause of the flaky context-menu test family. Retry the click until the
  // menu dialog actually opens.
  await expect(async () => {
    await target.click({ button: 'right', force: true })
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 20000 })
}

/**
 * Send through the real composer, but retry the action if the shared Supabase
 * request drops before even the optimistic bubble appears. The CI account uses
 * one remote project and an intermittent fetch failure otherwise makes the
 * context-menu step wait for a message that was never sent.
 */
async function sendMessageAndWait(page: Page, messageText: string) {
  const input = page.getByRole('textbox', { name: 'Message' })
  const bubble = page.getByText(messageText).last()

  await expect(async () => {
    if (await bubble.isVisible().catch(() => false)) return
    await input.fill(messageText)
    await page.keyboard.press('Enter')
    await expect(bubble).toBeVisible({ timeout: 5000 })
  }).toPass({ timeout: 30_000, intervals: [0, 1000, 2000, 3000] })
}

/** The chat tab badge (sidebar on desktop, tab bar on mobile): its number, or 0 when none is shown. */
async function badgeCount(page: Page) {
  const badge = page.getByTestId('chat-unread-badge').filter({ visible: true })
  if (await badge.count() === 0) return 0
  const text = (await badge.first().innerText()).trim()
  return text === '99+' ? 100 : Number(text)
}

/** Sum of the unread pips on the Chat list's rows. */
async function listUnreadTotal(page: Page) {
  const pips = await page.getByTestId('conversation-unread').filter({ visible: true }).allInnerTexts()
  return pips.reduce((n, t) => n + (t.trim() === '99+' ? 100 : Number(t.trim())), 0)
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('Chat', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Forward browser console errors to the test output so CI logs show them
    page.on('console', msg => {
      if (msg.type() === 'error') console.error(`[browser] ${msg.text()}`)
    })
    page.on('pageerror', err => console.error(`[page error] ${err.message}`))

    console.log(`→ starting: ${testInfo.title}`)
    // Authentication is performed once by auth.setup.ts and restored into
    // each browser context. Navigate to chat and wait for it to fully load.
    await page.goto(`${BASE_URL}/chat`)
    await page.reload()
    await page.waitForTimeout(3000)
    await dismissErrorOverlays(page)
    // Keep negative assertions from passing vacuously on the login screen.
    await expect(chatHeader(page)).toBeVisible({ timeout: 20_000 })
    console.log(`→ ready: ${testInfo.title}`)
  })

  // ── 0. Tab badge (#146) ────────────────────────────────────────────────────

  test('the tab badge matches the list, and after opening the DM it stays put across a recount and a reload', async ({ page }) => {
    // The badge starts 1.5s after sign-in; give it time, then it must agree with the rows.
    await expect.poll(async () => (await badgeCount(page)) - (await listUnreadTotal(page)), { timeout: 15_000 }).toBe(0)

    // Opening the seed DM marks it read (debounced 1s), then the list is recounted once the read is saved.
    await gotoConversation(page)
    await page.waitForTimeout(2500)
    await page.goto(`${BASE_URL}/chat`)
    await expect(chatHeader(page)).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(4000)
    const settled = await badgeCount(page)
    expect(settled).toBe(await listUnreadTotal(page))

    // No ghost: the same count after a reload (and once the badge's delayed first fetch has landed).
    await page.reload()
    await expect(chatHeader(page)).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(4000)
    expect(await badgeCount(page)).toBe(settled)
    expect(await listUnreadTotal(page)).toBe(settled)
  })

  // ── 1. Chat list ───────────────────────────────────────────────────────────

  test('"Active now" section is not shown on the chat list', async ({ page }) => {
    await expect(page.getByText('Active now', { exact: false })).not.toBeVisible()
  })

  test('chat list renders conversations', async ({ page }) => {
    await expect(chatHeader(page)).toBeVisible()
    // At least one conversation row should exist
    const rows = page.locator('[data-testid="conversation-row"], [role="button"]')
    await expect(rows.first()).toBeVisible()
  })

  test('chat list shows a last message preview for each conversation', async ({ page }) => {
    // Each row should have some preview text — just check the first row has non-empty content
    const firstRow = page.locator('[role="button"]').first()
    await expect(firstRow).toBeVisible()
    const text = await firstRow.textContent()
    expect(text?.trim().length).toBeGreaterThan(0)
  })

  test('compose button opens user search', async ({ page }) => {
    await page.getByRole('button', { name: 'New message' }).click()
    await page.waitForTimeout(1000)
    await expect(page.getByRole('textbox')).toBeVisible()
    // Exact: the seed DM's preview can contain "cancel" (another spec's e2e-cancel-edit message).
    await expect(page.getByText('Cancel', { exact: true })).toBeVisible()
  })

  test('compose search returns matching users', async ({ page }) => {
    await page.getByRole('button', { name: 'New message' }).click()
    await page.waitForTimeout(500)
    await page.getByRole('textbox').fill('e2ebud')
    await page.waitForTimeout(1500)
    await expect(page.getByText('@e2ebuddy')).toBeVisible()
  })

  test('selecting a user from compose opens the conversation', async ({ page }) => {
    await page.getByRole('button', { name: 'New message' }).click()
    await page.waitForTimeout(500)
    await page.getByRole('textbox').fill('e2ebud')
    await page.waitForTimeout(1500)
    // Target the @username, not the display name: a member can rename
    // themselves at any time, and this test previously hard-coded a first/last
    // name that has since changed. The username is the stable identifier, and
    // it's what the sibling search test asserts on.
    await page.getByText('@e2ebuddy').first().click({ force: true })
    await page.waitForTimeout(1500)
    expect(page.url()).toBe(CONVO_URL)
  })

  // ── 2. Conversation view ───────────────────────────────────────────────────

  test('opening a conversation loads the message input', async ({ page }) => {
    await gotoConversation(page)
    await page.waitForTimeout(2000)
    const input = page.getByRole('textbox', { name: 'Message' })
    await expect(input).toBeVisible()
  })

  test('back arrow returns to chat list', async ({ page }) => {
    await gotoConversation(page)
    await page.waitForTimeout(2000)
    // Click the back arrow (leftmost interactive element near the top)
    await page.goBack()
    await page.waitForTimeout(1000)
    expect(page.url()).toBe(`${BASE_URL}/chat`)
  })

  test('reply quotes show on messages with reply_to_id', async ({ page }) => {
    // Send a message, reply to it, then verify the quote appears
    await gotoConversation(page)
    await page.waitForTimeout(2000)

    const original = `e2e-reply-target-${Date.now()}`
    await page.getByRole('textbox', { name: 'Message' }).fill(original)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)

    await openContextMenu(page, original)
    await page.getByRole('dialog').getByText('Reply', { exact: true }).click({ force: true })
    await page.waitForTimeout(600)

    const reply = `e2e-reply-body-${Date.now()}`
    await page.getByRole('textbox', { name: 'Message' }).fill(reply)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(2000)

    // The reply quote should reference the original message
    await expect(page.getByText(original).first()).toBeVisible()
    await expect(page.getByText(reply)).toBeVisible()
  })

  test('chat room loads scrolled to the bottom (newest messages visible)', async ({ page }) => {
    await gotoConversation(page)
    await page.waitForTimeout(2000)

    // The input bar should be visible without any scrolling — meaning we're already at the bottom
    const input = page.getByRole('textbox', { name: 'Message' })
    await expect(input).toBeVisible()

    // The message list itself (not the page) opens at its very end.
    const state = await listState(page)
    expect(state).not.toBeNull()
    expect(state!.fromBottom).toBeLessThan(120)
  })

  test('long conversation: opens at the newest, keeps a bounded DOM, loads older on scroll-up without a jump', async ({ page }) => {
    // The seed DM has hundreds of messages; a page is 40.
    await gotoConversation(page)
    // The list is its own chunk on web (#193): wait for its rows, then let it settle.
    await page.locator('[data-testid="chat-message-list"] [data-index]').first().waitFor({ timeout: 20_000 })
    await page.waitForTimeout(1500)
    const opened = await listState(page)
    expect(opened).not.toBeNull()
    expect(opened!.fromBottom).toBeLessThan(120)
    // Virtualized: far fewer rows in the DOM than the 40 loaded.
    expect(opened!.rows).toBeGreaterThan(0)
    expect(opened!.rows).toBeLessThan(40)

    // Scroll up to the top, but stop wheeling as soon as an older page has
    // landed: every further wheel would re-pin the view to the new top and,
    // looped, page in the whole history (the seed DM grows every run).
    const list = page.getByTestId('chat-message-list')
    await list.hover()
    const before = opened!
    await expect(async () => {
      let s = (await listState(page))!
      if (s.scrollHeight <= before.scrollHeight + 500 && s.scrollTop > 5) {
        await page.mouse.wheel(0, -100000)
        await page.waitForTimeout(400)
        s = (await listState(page))!
      }
      // The older page was prepended ABOVE the reader: content grew, and the
      // reader moved down with it instead of being left at scrollTop 0.
      expect(s.scrollHeight).toBeGreaterThan(before.scrollHeight + 500)
      expect(s.scrollTop).toBeGreaterThan(500)
    }).toPass({ timeout: 20000 })

    // Still virtualized after more history loaded.
    const after = (await listState(page))!
    expect(after.rows).toBeLessThan(40)
  })

  test('messages render in chronological order (oldest at top, newest at bottom)', async ({ page }) => {
    await gotoConversation(page)
    await page.waitForTimeout(2000)

    // Send two messages in sequence and verify they appear in order
    const first = `e2e-order-first-${Date.now()}`
    const second = `e2e-order-second-${Date.now()}`

    await page.getByRole('textbox', { name: 'Message' }).fill(first)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1000)
    await page.getByRole('textbox', { name: 'Message' }).fill(second)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)

    const firstBox = await page.getByText(first).boundingBox()
    const secondBox = await page.getByText(second).boundingBox()
    expect(firstBox).not.toBeNull()
    expect(secondBox).not.toBeNull()
    // First message should be above (lower y) the second
    expect(firstBox!.y).toBeLessThan(secondBox!.y)
  })

  // ── 3. Send message ────────────────────────────────────────────────────────

  test('sends a message and it appears in the conversation', async ({ page }) => {
    await gotoConversation(page)
    await page.waitForTimeout(2000)

    const unique = `e2e-send-${Date.now()}`
    const input = page.getByRole('textbox', { name: 'Message' })
    await input.fill(unique)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(2000)

    await expect(page.getByText(unique)).toBeVisible()
    // Input should be cleared after send
    await expect(input).toHaveValue('')
  })

  test('after sending a message the view stays scrolled to the bottom', async ({ page }) => {
    await gotoConversation(page)
    await page.waitForTimeout(2000)

    const unique = `e2e-scroll-${Date.now()}`
    await page.getByRole('textbox', { name: 'Message' }).fill(unique)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)

    const state = await listState(page)
    expect(state!.fromBottom).toBeLessThan(120)
    await expect(page.getByText(unique)).toBeVisible()
  })

  // ── 4. Context menu ────────────────────────────────────────────────────────

  test('right-click on own message shows emoji picker + Reply + Edit + Delete', async ({ page }) => {
    await gotoConversation(page)
    await page.waitForTimeout(2000)

    // Send a fresh message so we have a guaranteed own message
    const unique = `e2e-ctx-${Date.now()}`
    await page.getByRole('textbox', { name: 'Message' }).fill(unique)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)

    await openContextMenu(page, unique)
    // Scope to the menu dialog — 👍/Reply/etc. can also appear as message
    // content or reactions in the conversation itself
    const menu = page.getByRole('dialog')
    await expect(menu.getByText('👍')).toBeVisible()
    await expect(menu.getByText('Reply', { exact: true })).toBeVisible()
    await expect(menu.getByText('Edit', { exact: true })).toBeVisible()
    await expect(menu.getByText('Delete', { exact: true })).toBeVisible()
  })

  // ── 5. Edit message ────────────────────────────────────────────────────────

  test('editing a message updates its content with (edited) label', async ({ page }) => {
    await gotoConversation(page)
    await page.waitForTimeout(2000)

    const original = `e2e-edit-${Date.now()}`
    const edited = `${original}-EDITED`
    await page.getByRole('textbox', { name: 'Message' }).fill(original)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)

    await openContextMenu(page, original)
    await page.getByRole('dialog').getByText('Edit', { exact: true }).click({ force: true })
    await page.waitForTimeout(800)

    // Edit banner should appear
    await expect(page.getByText('Editing message')).toBeVisible()

    // Update content and submit
    const input = page.getByRole('textbox', { name: 'Message' })
    await input.fill(edited)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)

    await expect(page.getByText(edited)).toBeVisible()
    // .last() — prior runs left other "(edited)" messages in the history
    await expect(page.getByText('(edited)').last()).toBeVisible()
  })

  test('edit banner can be cancelled with the × button', async ({ page }) => {
    await gotoConversation(page)
    await page.waitForTimeout(2000)

    const unique = `e2e-cancel-edit-${Date.now()}`
    await page.getByRole('textbox', { name: 'Message' }).fill(unique)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)

    await openContextMenu(page, unique)
    await page.getByRole('dialog').getByText('Edit', { exact: true }).click({ force: true })
    await page.waitForTimeout(600)
    await expect(page.getByText('Editing message')).toBeVisible()

    // Cancel
    await page.getByRole('button', { name: 'Cancel edit' }).click({ force: true })
    await page.waitForTimeout(600)
    await expect(page.getByText('Editing message')).not.toBeVisible()
  })

  // ── 6. Reply ───────────────────────────────────────────────────────────────

  // NOTE: reply tests send a fresh target message rather than replying to an
  // old seed message — the conversation history is long enough that old
  // messages are no longer in the initially loaded page.

  test('replying shows the reply banner with the quoted message', async ({ page }) => {
    await gotoConversation(page)

    const target = `e2e-reply-banner-${Date.now()}`
    await page.getByRole('textbox', { name: 'Message' }).fill(target)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)

    await openContextMenu(page, target)
    await page.getByRole('dialog').getByText('Reply', { exact: true }).click({ force: true })
    await page.waitForTimeout(800)

    await expect(page.getByText('Replying to')).toBeVisible()
    await expect(page.getByText(target).first()).toBeVisible()
  })

  test('reply banner can be dismissed with ×', async ({ page }) => {
    await gotoConversation(page)

    const target = `e2e-reply-dismiss-${Date.now()}`
    await page.getByRole('textbox', { name: 'Message' }).fill(target)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)

    await openContextMenu(page, target)
    await page.getByRole('dialog').getByText('Reply', { exact: true }).click({ force: true })
    await page.waitForTimeout(800)
    await expect(page.getByText('Replying to')).toBeVisible()

    await page.getByRole('button', { name: 'Cancel reply' }).click({ force: true })
    await page.waitForTimeout(600)
    await expect(page.getByText('Replying to')).not.toBeVisible()
  })

  test('sent reply shows quote above the message bubble', async ({ page }) => {
    await gotoConversation(page)

    const target = `e2e-reply-quote-target-${Date.now()}`
    await sendMessageAndWait(page, target)

    await openContextMenu(page, target)
    await page.getByRole('dialog').getByText('Reply', { exact: true }).click({ force: true })
    await page.waitForTimeout(600)

    const unique = `e2e-reply-${Date.now()}`
    await sendMessageAndWait(page, unique)

    await expect(page.getByText(unique)).toBeVisible()
    // The quote above the reply repeats the target text — so it appears twice
    await expect(page.getByText(target).first()).toBeVisible()
    expect(await page.getByText(target).count()).toBeGreaterThanOrEqual(2)
  })

  // ── 7. Emoji reactions ─────────────────────────────────────────────────────

  test('adding an emoji reaction shows it on the message bubble', async ({ page }) => {
    await gotoConversation(page)
    await page.waitForTimeout(2000)

    const unique = `e2e-react-${Date.now()}`
    await page.getByRole('textbox', { name: 'Message' }).fill(unique)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)

    await openContextMenu(page, unique)
    await page.getByRole('dialog').getByText('👍').click({ force: true })
    await page.waitForTimeout(1500)

    // The reaction pill should now be visible near the message
    await expect(page.getByText('👍').first()).toBeVisible()
  })

  // ── 8. Image sending ──────────────────────────────────────────────────────
  //
  // expo-image-picker on web creates a hidden <input type="file"> and waits
  // for a 'change' event. It activates the input via a synthetic MouseEvent
  // click — not a real user gesture — so Playwright's filechooser interception
  // never fires. We inject a MutationObserver that detects the file input,
  // overrides input.files via DataTransfer, and dispatches 'change' so the
  // picker promise resolves with our test image.

  async function pickImage(page: Page) {
    const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

    await dismissErrorOverlays(page)

    await page.evaluate((pngB64: string) => {
      (window as any).__imagePicked = false
      const obs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            const el = node as HTMLInputElement
            if (el.tagName !== 'INPUT' || el.type !== 'file') continue
            obs.disconnect()
            const bin = atob(pngB64)
            const bytes = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
            const file = new File([bytes], 'test.png', { type: 'image/png' })
            const dt = new DataTransfer()
            dt.items.add(file)
            Object.defineProperty(el, 'files', { value: dt.files, configurable: true })
            // Defer so expo's 'change' listener is registered before we fire
            Promise.resolve().then(() => {
              el.dispatchEvent(new Event('change', { bubbles: true }))
              ;(window as any).__imagePicked = true
            })
          }
        }
      })
      obs.observe(document.body, { childList: true })
    }, PNG_B64)

    await page.getByRole('button', { name: 'Attach image' }).click({ force: true })

    await page.waitForFunction(() => (window as any).__imagePicked === true, { timeout: 8000 })
    await page.waitForTimeout(500)
  }

  test('selecting an image shows a preview thumbnail above the input bar', async ({ page }) => {
    await gotoConversation(page)
    await page.waitForTimeout(2000)

    await pickImage(page)

    await expect(page.locator('img[src^="blob:"]').last()).toBeVisible()
  })

  // ── 9. Delete message ──────────────────────────────────────────────────────

  test('deleting a message marks it as deleted (visible after reload)', async ({ page }) => {
    await gotoConversation(page)
    await page.waitForTimeout(2000)

    const unique = `e2e-delete-${Date.now()}`
    await page.getByRole('textbox', { name: 'Message' }).fill(unique)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)

    await openContextMenu(page, unique)
    await page.getByText('Delete', { exact: true }).click({ force: true })
    await page.waitForTimeout(1000)

    // Reload to confirm the server persisted the soft-delete
    await page.reload()
    await page.waitForTimeout(3000)
    await expect(page.getByText(unique)).not.toBeVisible()
    await expect(page.getByText('Message deleted').last()).toBeVisible()
  })
})
