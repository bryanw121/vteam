import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeEntryMap, firstLoadScripts, packageOf } from './entry-deps.mjs'

test('packageOf names scoped and plain packages, null for app code', () => {
  assert.equal(packageOf('/w/node_modules/react-native-reanimated/lib/module/index.js'), 'react-native-reanimated')
  assert.equal(packageOf('/w/node_modules/@egjs/hammerjs/dist/hammer.js'), '@egjs/hammerjs')
  assert.equal(packageOf('/w/components/ProfileAvatar.tsx'), null)
})

test('analyzeEntryMap flags lazy-only packages and ranks the rest', () => {
  const map = {
    sources: ['/w/node_modules/react-dom/a.js', '/w/node_modules/react-native-gesture-handler/b.js', '/w/app/_layout.tsx'],
    sourcesContent: ['x'.repeat(3000), 'y'.repeat(100), 'z'.repeat(2000)],
  }
  const { banned, packages } = analyzeEntryMap(map)
  assert.deepEqual(banned.map(b => b.pkg), ['react-native-gesture-handler'])
  assert.deepEqual(packages.map(p => p.pkg), ['react-dom', '(app code)', 'react-native-gesture-handler'])
})

test('a clean entry has nothing banned', () => {
  assert.deepEqual(analyzeEntryMap({ sources: ['/w/node_modules/react/index.js'] }).banned, [])
})

test('firstLoadScripts lists the scripts index.html loads, in order', () => {
  const html = '<script src="/_expo/static/js/web/__expo-metro-runtime-1.js" defer></script><script src="/_expo/static/js/web/__common-2.js" defer></script><script src="/_expo/static/js/web/entry-3.js" defer></script>'
  assert.deepEqual(firstLoadScripts(html), ['/_expo/static/js/web/__expo-metro-runtime-1.js', '/_expo/static/js/web/__common-2.js', '/_expo/static/js/web/entry-3.js'])
})
