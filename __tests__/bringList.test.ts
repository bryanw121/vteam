import { readFileSync } from 'fs'
import { join } from 'path'
import {
  applyClaim, bringCoverage, bringDraftsChanged, bringItemAction, bringItemStatus, bringSuggestions,
  clampBringQuantity, draftsFromItems, draftsFromTemplate, myClaim, newBringDraft, saveBringArgs, templateBringItems,
} from '../utils/bringList'
import { BRING_LIMITS } from '../constants/bringItems'
import { NOTIFICATION_TYPES } from '../types'
import type { BringClaimer, BringItem, BringItemDraft, BringViewer } from '../types'

const ME = 'me'
const claimer = (user_id: string, quantity = 1, first_name: string | null = null): BringClaimer => ({
  user_id, quantity, username: user_id, first_name, last_name: null, avatar_url: null,
})
const item = (over: Partial<BringItem> = {}): BringItem => ({
  id: 'i1', label: 'Net + antennas', quantity: 1, required: true, position: 0, claimed: 0, claimers: [], ...over,
})
const viewer = (over: Partial<BringViewer> = {}): BringViewer => ({ userId: ME, canClaim: true, closed: false, ...over })

describe('bringCoverage', () => {
  it('counts items with enough claimed', () => {
    expect(bringCoverage([
      item({ id: 'a', claimed: 1 }),
      item({ id: 'b', quantity: 2, claimed: 1 }),
      item({ id: 'c', quantity: 2, claimed: 2 }),
    ])).toEqual({ covered: 2, total: 3 })
    expect(bringCoverage([])).toEqual({ covered: 0, total: 0 })
  })
})

describe('bringItemAction', () => {
  it('offers to claim what is still needed', () => {
    expect(bringItemAction(item(), viewer())).toEqual({ kind: 'claim', quantity: 1, label: "I'll bring it" })
    expect(bringItemAction(item({ quantity: 2, claimed: 1, claimers: [claimer('jo')] }), viewer()))
      .toEqual({ kind: 'claim', quantity: 1, label: "I'll bring 1" })
  })

  it('lets the viewer let go of their own claim, until the game starts', () => {
    const mine = item({ claimed: 1, claimers: [claimer(ME)] })
    expect(bringItemAction(mine, viewer()).kind).toBe('release')
    expect(bringItemAction(mine, viewer({ closed: true })).kind).toBe('closed')
  })

  it('shows covered items as done, for everyone', () => {
    const covered = item({ claimed: 1, claimers: [claimer('jo')] })
    expect(bringItemAction(covered, viewer()).kind).toBe('covered')
    expect(bringItemAction(covered, viewer({ userId: null, canClaim: false })).kind).toBe('covered')
  })

  it('asks guests to sign in and players not going to join', () => {
    expect(bringItemAction(item(), viewer({ userId: null, canClaim: false })).kind).toBe('signIn')
    expect(bringItemAction(item(), viewer({ canClaim: false })).kind).toBe('join')
    expect(bringItemAction(item(), viewer({ closed: true })).kind).toBe('closed')
  })
})

describe('bringItemStatus', () => {
  it('names who is bringing it', () => {
    expect(bringItemStatus(item({ claimed: 1, claimers: [claimer('p', 1, 'Priya')] }), ME)).toEqual({ text: 'Priya is bringing it', tone: 'ok' })
    expect(bringItemStatus(item({ claimed: 1, claimers: [claimer(ME)] }), ME)).toEqual({ text: 'You are bringing it', tone: 'ok' })
  })

  it('says how many more are needed', () => {
    const balls = item({ label: 'Game balls', quantity: 3, required: false, claimed: 2, claimers: [claimer(ME), claimer('j', 1, 'Jordan')] })
    expect(bringItemStatus(balls, ME)).toEqual({ text: 'You and Jordan (1) are bringing it · 1 more needed', tone: 'muted' })
  })

  it('marks uncovered items, louder when required', () => {
    expect(bringItemStatus(item(), ME)).toEqual({ text: 'Still needed for the game', tone: 'need' })
    expect(bringItemStatus(item({ required: false }), ME)).toEqual({ text: 'Still needed', tone: 'need' })
  })

  it('shows guests counts without names', () => {
    expect(bringItemStatus(item({ quantity: 2, claimed: 1 }), null)).toEqual({ text: '1 of 2 covered · 1 more needed', tone: 'muted' })
    expect(bringItemStatus(item({ claimed: 1 }), null)).toEqual({ text: 'Covered', tone: 'ok' })
  })
})

describe('host form drafts', () => {
  it('suggests by surface and hides what is listed', () => {
    expect(bringSuggestions('sand', [])[0]).toBe('Net + antennas')
    expect(bringSuggestions('indoor', [])).not.toContain('Net + antennas')
    expect(bringSuggestions('sand', [{ label: 'net + antennas', quantity: 1, required: true, mine: false }])).not.toContain('Net + antennas')
    expect(bringSuggestions(null, []).length).toBeGreaterThan(0)
  })

  it('adds a draft with sensible defaults, no duplicates, up to the limit', () => {
    expect(newBringDraft('Net + antennas', [])).toEqual({ label: 'Net + antennas', quantity: 1, required: true, mine: false })
    expect(newBringDraft('Game balls', [])?.quantity).toBe(2)
    expect(newBringDraft('  ', [])).toBeNull()
    const one = newBringDraft('Cones', [])!
    expect(newBringDraft('cones', [one])).toBeNull()
    const full = Array.from({ length: BRING_LIMITS.items }, (_, i) => ({ label: `x${i}`, quantity: 1, required: false, mine: false }))
    expect(newBringDraft('Speaker', full)).toBeNull()
    expect(newBringDraft('a'.repeat(60), [])?.label).toHaveLength(BRING_LIMITS.label)
  })

  it('clamps quantities to 1…6', () => {
    expect(clampBringQuantity(0)).toBe(1)
    expect(clampBringQuantity(9)).toBe(6)
    expect(clampBringQuantity(2.6)).toBe(3)
  })

  it('round-trips the saved list, keeping ids only on an edit', () => {
    const saved = [item({ claimed: 1, claimers: [claimer(ME)] }), item({ id: 'i2', label: 'Game balls', quantity: 2, required: false, position: 1 })]
    const drafts = draftsFromItems(saved, ME)
    expect(drafts).toEqual([
      { id: 'i1', label: 'Net + antennas', quantity: 1, required: true, mine: true },
      { id: 'i2', label: 'Game balls', quantity: 2, required: false, mine: false },
    ])
    expect(saveBringArgs('e1', drafts, true).p_items[0]).toEqual({ id: 'i1', label: 'Net + antennas', quantity: 1, required: true, mine: true })
    expect(saveBringArgs('e1', drafts, false).p_items[0]).not.toHaveProperty('id')
    expect(bringDraftsChanged(drafts, drafts)).toBe(false)
    expect(bringDraftsChanged(drafts, [{ ...drafts[0], quantity: 2 }, drafts[1]])).toBe(true)
    expect(bringDraftsChanged(drafts, drafts.slice(0, 1))).toBe(true)
  })

  it('reads templates defensively and stores them without ids', () => {
    expect(draftsFromTemplate(null)).toEqual([])
    expect(draftsFromTemplate([{ label: 'Net', quantity: 9, required: true }, { nope: 1 }, 'x', { label: 'net' }]))
      .toEqual([{ label: 'Net', quantity: 6, required: true, mine: false }])
    const drafts: BringItemDraft[] = [{ id: 'i1', label: 'Net', quantity: 1, required: true, mine: true }]
    expect(templateBringItems(drafts)).toEqual([{ label: 'Net', quantity: 1, required: true, mine: true }])
    expect(templateBringItems([])).toBeNull()
  })
})

describe('applyClaim (optimistic)', () => {
  it('claims what is left and releases', () => {
    const balls = item({ id: 'b', quantity: 2, claimed: 1, claimers: [claimer('jo')] })
    const claimed = applyClaim([balls], 'b', ME, 2)[0]
    expect(claimed.claimed).toBe(2)
    expect(myClaim(claimed, ME)).toBe(1)
    const released = applyClaim([claimed], 'b', ME, 0)[0]
    expect(released.claimed).toBe(1)
    expect(myClaim(released, ME)).toBe(0)
  })

  it('leaves a covered item alone', () => {
    const net = item({ claimed: 1, claimers: [claimer('jo')] })
    expect(applyClaim([net], 'i1', ME, 1)[0]).toBe(net)
  })
})

describe('event_bring_items migration', () => {
  const dir = join(__dirname, '..', 'supabase', 'migrations')
  const up = readFileSync(join(dir, '20261112190000_event_bring_items.sql'), 'utf8')
  const down = readFileSync(join(dir, '20261112190000_event_bring_items.down.sql'), 'utf8')
  const typesIn = (sql: string) => {
    const block = sql.slice(sql.indexOf('add constraint notifications_notification_type_check'))
    return [...block.slice(0, block.indexOf(');')).matchAll(/'([a-z_]+)'/g)].map(m => m[1])
  }

  it('allows exactly NOTIFICATION_TYPES, and the down drops only the new one', () => {
    // Reports (#243) and new game alerts (#170) and club polls (#175) add types in later migrations.
    const later: readonly string[] = ['report_resolved', 'moderation_warning', 'new_game', 'club_poll']
    const ofTheTime = NOTIFICATION_TYPES.filter(t => !later.includes(t))
    expect(typesIn(up).sort()).toEqual([...ofTheTime].sort())
    expect(typesIn(down).sort()).toEqual(ofTheTime.filter(t => t !== 'bring_item_uncovered').sort())
  })

  it('matches the app limits', () => {
    expect(up).toMatch(new RegExp(`char_length\\(btrim\\(label\\)\\) between 1 and ${BRING_LIMITS.label}`))
    expect(up).toMatch(new RegExp(`quantity between 1 and ${BRING_LIMITS.quantity}`))
    expect(up).toMatch(new RegExp(`jsonb_array_length\\(p_items\\) > ${BRING_LIMITS.items}`))
  })

  it('gives clients no writes and pins search_path on every definer function', () => {
    expect(up).toMatch(/revoke all on public\.event_bring_items from anon, authenticated/)
    expect(up).toMatch(/revoke all on public\.event_bring_claims from anon, authenticated/)
    expect(up).toMatch(/revoke all on public\.event_bring_alert_log from anon, authenticated/)
    const fns = up.split(/create or replace function /).slice(1)
    expect(fns.length).toBe(6)
    for (const fn of fns) expect(fn).toMatch(/security definer\s+set search_path (=|to) ''/)
    for (const name of ['save_event_bring_items', 'claim_bring_item', 'release_bring_item']) {
      expect(up).toMatch(new RegExp(`revoke execute on function public\\.${name}\\([^)]*\\) from public, anon;`))
    }
    expect(up).toMatch(/revoke execute on function public\.send_event_reminders\(\) from public, anon, authenticated/)
  })

  it('cascades every reference so account and event deletion need no changes', () => {
    for (const m of up.matchAll(/references public\.(\w+)\(id\)([^,\n]*)/g)) expect(m[2]).toMatch(/on delete cascade/)
  })

  it('the down undoes every object the up creates', () => {
    for (const obj of ['event_bring_items', 'event_bring_claims', 'event_bring_alert_log']) expect(down).toMatch(new RegExp(`drop table if exists public\\.${obj}`))
    for (const fn of ['get_event_bring_list', 'save_event_bring_items', 'claim_bring_item', 'release_bring_item', 'release_bring_claims_on_leave']) {
      expect(down).toMatch(new RegExp(`drop function if exists public\\.${fn}\\(`))
    }
    expect(down).toMatch(/drop trigger if exists event_attendees_release_bring_claims/)
    expect(down).toMatch(/drop column if exists bring_items/)
    expect(down).not.toMatch(/bring_item_uncovered'\s*\]/)
  })
})
