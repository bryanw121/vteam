import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CHUNK_DIR, eventChunkSrc, preloadTag, writeEventChunk } from './event-chunk.mjs'

test('finds the one event chunk among the export files', () => {
  assert.equal(
    eventChunkSrc(['entry-abc.js', 'EventDetailScreen-0f3a9c.js', '__common-1.js', '[id]-2.js']),
    '/_expo/static/js/web/EventDetailScreen-0f3a9c.js',
  )
})

test('fails on no chunk and on two', () => {
  assert.throws(() => eventChunkSrc(['entry-abc.js']), /found 0/)
  assert.throws(() => eventChunkSrc(['EventDetailScreen-a.js', 'EventDetailScreen-b.js']), /found 2/)
  // Only the screen chunk, not look-alikes.
  assert.throws(() => eventChunkSrc(['EventDetailScreen-a.js.map', 'MyEventDetailScreen-a.js']), /found 0/)
})

test('the preload tag', () => {
  assert.equal(preloadTag('/_expo/static/js/web/EventDetailScreen-1.js'), '<link rel="preload" as="script" href="/_expo/static/js/web/EventDetailScreen-1.js">')
})

test('writes event-chunk.json into the export', async () => {
  const dist = await mkdtemp(join(tmpdir(), 'event-chunk-'))
  await mkdir(join(dist, CHUNK_DIR), { recursive: true })
  await writeFile(join(dist, CHUNK_DIR, 'EventDetailScreen-9.js'), '')
  await writeFile(join(dist, CHUNK_DIR, 'entry-1.js'), '')
  await writeEventChunk(dist)
  const json = JSON.parse(await readFile(join(dist, 'event-chunk.json'), 'utf8'))
  assert.deepEqual(json, { src: '/_expo/static/js/web/EventDetailScreen-9.js', tag: preloadTag('/_expo/static/js/web/EventDetailScreen-9.js') })
})
