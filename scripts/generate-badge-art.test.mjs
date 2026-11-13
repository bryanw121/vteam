import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseArgs, tierSpecs } from './generate-badge-art.mjs'

const catalog = {
  defs: [
    { type: 'serve_cheer', description: 'Receive serving cheers', tiers: [{ tier: 1, label: 'Server' }, { tier: 2, label: 'Ace' }] },
    { type: 'beta_tester', description: 'Participated in the app beta', tiers: [{ tier: 1, label: 'Beta Tester' }] },
    { type: 'no_palette', description: 'x', tiers: [{ tier: 1, label: 'X' }] },
  ],
  title: type => ({ serve_cheer: 'Serve', beta_tester: 'Beta Tester' })[type] ?? type,
  tierColor: (def, tier) => (def.tiers.length === 1 ? '#FFD700' : ['', '#CD7F32', '#A8A9AD'][tier]),
  gradients: { serve_cheer: ['#26C6DA', '#00838F'], beta_tester: ['#A78BFA', '#6C47FF'] },
}

test('builds one spec per tier from the catalog', () => {
  assert.deepEqual(tierSpecs(catalog, { badge: 'serve_cheer', tier: 2 }), [{
    badge: 'serve_cheer', title: 'Serve', description: 'Receive serving cheers', tier: 2, tierName: 'Ace',
    maxTier: 2, accent: '#A8A9AD', palette: ['#26C6DA', '#00838F'],
  }])
  assert.equal(tierSpecs(catalog, { badge: 'serve_cheer' }).length, 2)
})

test('--missing skips tiers that already have art, and badges without a palette', () => {
  const specs = tierSpecs(catalog, { skip: new Set(['serve_cheer:1']) })
  assert.deepEqual(specs.map(s => `${s.badge}:${s.tier}`), ['serve_cheer:2', 'beta_tester:1'])
})

test('parses arguments', () => {
  assert.deepEqual(parseArgs(['serve_cheer', '2']), { badge: 'serve_cheer', tier: 2, missing: false, dryRun: false })
  assert.deepEqual(parseArgs(['--missing', '--dry-run']), { badge: undefined, tier: undefined, missing: true, dryRun: true })
  assert.ok(parseArgs([]).error)
  assert.ok(parseArgs(['x', '0']).error)
  assert.ok(parseArgs(['--missing', 'x']).error)
  assert.ok(parseArgs(['--nope']).error)
})
