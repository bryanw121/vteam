// node --test scripts/shots/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ALIGN_GROUPS, ALIGN_SURFACES, misalignments } from './lib/alignment.mjs'

const base = { group: 'Prompt', surface: 'phone', textSize: 'default' }

test('anchors at the same height pass, within a pixel of rounding', () => {
  assert.deepEqual(misalignments({ ...base, tops: { '/chat': { title: 246, buttons: 376 }, '/profile': { title: 246.6, buttons: 376 } } }), [])
})

test('a button that moves between tabs fails and says by how much', () => {
  const p = misalignments({ ...base, tops: { '/chat': { title: 246, buttons: 376 }, '/profile': { title: 177, buttons: 307 } } })
  assert.equal(p.length, 2)
  assert.match(p[1], /"buttons" sits at different heights \(\/chat 376px, \/profile 307px; 69px apart\)/)
  assert.match(p[1], /Prompt \(phone, default text\)/)
})

test('an anchor missing from a screen fails', () => {
  const p = misalignments({ ...base, tops: { '/chat': { title: 246 }, '/profile': { title: null } } })
  assert.deepEqual(p, ['Prompt (phone, default text): "title" not found on /profile'])
})

test('every group compares at least two screens and has anchors', () => {
  for (const g of ALIGN_GROUPS) {
    assert.ok(g.routes.length >= 2, g.name)
    assert.ok(g.anchors.length >= 1, g.name)
    for (const s of g.surfaces ?? []) assert.ok(ALIGN_SURFACES.some(x => x.name === s), `${g.name}: unknown surface ${s}`)
  }
})
