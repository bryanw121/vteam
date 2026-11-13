import { BRING_COPY, BRING_DEFAULT_QUANTITY, BRING_LIMITS, BRING_REQUIRED_BY_DEFAULT, BRING_SUGGESTIONS } from '../constants/bringItems'
import type {
  BringItem, BringItemAction, BringItemDraft, BringViewer, SaveBringItemsArgs, Surface,
} from '../types'

/**
 * What to bring (#256): pure helpers for the event card and the host form.
 * No React, no Supabase: unit-tested in __tests__/bringList.test.ts.
 */

/** Items fully covered (claimed >= quantity), and how many there are. */
export function bringCoverage(items: readonly BringItem[]): { covered: number; total: number } {
  return { covered: items.filter(i => i.claimed >= i.quantity).length, total: items.length }
}

/** How much the viewer has claimed of an item (0 when not bringing it, or for guests who see no names). */
export function myClaim(item: BringItem, userId: string | null): number {
  if (!userId) return 0
  return item.claimers.find(c => c.user_id === userId)?.quantity ?? 0
}

/** The button on one item row. */
export function bringItemAction(item: BringItem, viewer: BringViewer): BringItemAction {
  const mine = myClaim(item, viewer.userId)
  if (mine > 0) return viewer.closed ? { kind: 'closed' } : { kind: 'release', label: BRING_COPY.bringing }
  const left = item.quantity - item.claimed
  if (left <= 0) return { kind: 'covered' }
  if (viewer.closed) return { kind: 'closed' }
  if (!viewer.userId) return { kind: 'signIn' }
  if (!viewer.canClaim) return { kind: 'join' }
  return item.quantity > 1
    ? { kind: 'claim', quantity: 1, label: BRING_COPY.claimSome(1) }
    : { kind: 'claim', quantity: 1, label: BRING_COPY.claim }
}

function personName(c: BringItem['claimers'][number]): string {
  return c.first_name?.trim() || c.username?.trim() || 'Someone'
}

/** The line under an item's name: who is bringing it, or what is still needed. */
export function bringItemStatus(item: BringItem, userId: string | null): { text: string; tone: 'ok' | 'need' | 'muted' } {
  const mine = myClaim(item, userId)
  const others = item.claimers.filter(c => c.user_id !== userId)
  const left = Math.max(0, item.quantity - item.claimed)
  if (item.claimers.length === 0 && item.claimed > 0) {
    // A guest: counts, no names.
    return left > 0
      ? { text: `${item.claimed} of ${item.quantity} covered · ${left} more needed`, tone: 'muted' }
      : { text: 'Covered', tone: 'ok' }
  }
  if (item.claimed === 0) return { text: item.required ? `${BRING_COPY.stillNeeded} for the game` : BRING_COPY.stillNeeded, tone: 'need' }
  const names = [
    ...(mine > 0 ? ['You'] : []),
    ...others.map(o => (item.quantity > 1 ? `${personName(o)} (${o.quantity})` : personName(o))),
  ]
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  const verb = names.length === 1 && names[0] !== 'You' ? 'is' : 'are'
  const base = `${who} ${verb} bringing it`
  return left > 0 ? { text: `${base} · ${left} more needed`, tone: 'muted' } : { text: base, tone: 'ok' }
}

/** Suggestion chips for the host form, minus what is already listed. */
export function bringSuggestions(surface: Surface | null, drafts: readonly BringItemDraft[]): string[] {
  const listed = new Set(drafts.map(d => d.label.trim().toLowerCase()))
  return BRING_SUGGESTIONS[surface ?? 'any'].filter(s => !listed.has(s.toLowerCase()))
}

/** A new draft from a suggestion chip or the free-text field. Null when it can't be added. */
export function newBringDraft(label: string, drafts: readonly BringItemDraft[]): BringItemDraft | null {
  const clean = label.trim().slice(0, BRING_LIMITS.label)
  if (!clean || drafts.length >= BRING_LIMITS.items) return null
  if (drafts.some(d => d.label.trim().toLowerCase() === clean.toLowerCase())) return null
  return {
    label: clean,
    quantity: BRING_DEFAULT_QUANTITY[clean] ?? 1,
    required: BRING_REQUIRED_BY_DEFAULT.includes(clean),
    mine: false,
  }
}

/** Clamp a stepper change to 1…max. */
export function clampBringQuantity(n: number): number {
  return Math.min(BRING_LIMITS.quantity, Math.max(1, Math.round(n)))
}

/** The event's saved list as host-form drafts (edit mode). */
export function draftsFromItems(items: readonly BringItem[], userId: string | null): BringItemDraft[] {
  return items.map(i => ({ id: i.id, label: i.label, quantity: i.quantity, required: i.required, mine: myClaim(i, userId) > 0 }))
}

/** Template jsonb → drafts, dropping anything malformed (a template is user data). Never carries ids. */
export function draftsFromTemplate(raw: unknown): BringItemDraft[] {
  if (!Array.isArray(raw)) return []
  const out: BringItemDraft[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const v = r as Record<string, unknown>
    const label = typeof v.label === 'string' ? v.label.trim().slice(0, BRING_LIMITS.label) : ''
    if (!label || out.some(d => d.label.toLowerCase() === label.toLowerCase())) continue
    out.push({
      label,
      quantity: clampBringQuantity(typeof v.quantity === 'number' ? v.quantity : 1),
      required: v.required === true,
      mine: v.mine === true,
    })
    if (out.length >= BRING_LIMITS.items) break
  }
  return out
}

/** Drafts → what a template stores (no ids: a template is reused on new events). */
export function templateBringItems(drafts: readonly BringItemDraft[]): BringItemDraft[] | null {
  if (drafts.length === 0) return null
  return drafts.map(({ label, quantity, required, mine }) => ({ label, quantity, required, mine }))
}

/**
 * Drafts → `save_event_bring_items` args. On a new event no ids are sent; on an
 * edit the saved ids are kept so their claims survive.
 */
export function saveBringArgs(eventId: string, drafts: readonly BringItemDraft[], keepIds: boolean): SaveBringItemsArgs {
  return {
    p_event_id: eventId,
    p_items: drafts.slice(0, BRING_LIMITS.items).map(d => ({
      ...(keepIds && d.id ? { id: d.id } : {}),
      label: d.label.trim().slice(0, BRING_LIMITS.label),
      quantity: clampBringQuantity(d.quantity),
      required: d.required,
      mine: d.mine,
    })),
  }
}

/** Whether the host form's list differs from what is saved (skip the call on an untouched edit). */
export function bringDraftsChanged(saved: readonly BringItemDraft[], drafts: readonly BringItemDraft[]): boolean {
  if (saved.length !== drafts.length) return true
  return saved.some((s, i) => {
    const d = drafts[i]
    return s.id !== d.id || s.label !== d.label.trim() || s.quantity !== d.quantity || s.required !== d.required || s.mine !== d.mine
  })
}

/** Optimistic update after a claim or release, so the button flips at once. */
export function applyClaim(items: readonly BringItem[], itemId: string, userId: string, quantity: number): BringItem[] {
  return items.map(i => {
    if (i.id !== itemId) return i
    const others = i.claimers.filter(c => c.user_id !== userId)
    const othersQty = others.reduce((n, c) => n + c.quantity, 0)
    if (quantity <= 0) return { ...i, claimers: others, claimed: othersQty }
    const take = Math.min(quantity, Math.max(0, i.quantity - othersQty))
    if (take <= 0) return i
    const me = i.claimers.find(c => c.user_id === userId) ?? {
      user_id: userId, quantity: take, username: null, first_name: null, last_name: null, avatar_url: null,
    }
    return { ...i, claimers: [...others, { ...me, quantity: take }], claimed: othersQty + take }
  })
}
