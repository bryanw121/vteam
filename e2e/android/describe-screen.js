#!/usr/bin/env node
/**
 * What was on the emulator's screen when a Maestro flow failed (#361), as text
 * a job log and summary can show: screenshots only live in the artifact, which
 * can't be opened from a phone or a cloud session.
 *
 *   adb exec-out uiautomator dump /dev/tty | node e2e/android/describe-screen.js
 *
 * Reads a uiautomator XML dump on stdin and prints the package in front, any
 * "isn't responding" dialog, the visible texts and the resource ids, one per line.
 */
'use strict'

const ATTR = /(\w[\w-]*)="([^"]*)"/g

function decode(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
}

/** The <node> elements of a uiautomator dump, as attribute maps. */
function nodes(xml) {
  const out = []
  for (const m of String(xml).matchAll(/<node\b([^>]*?)\/?>/g)) {
    const attrs = {}
    for (const a of m[1].matchAll(ATTR)) attrs[a[1]] = decode(a[2])
    out.push(attrs)
  }
  return out
}

/** Pure: the dump summarised for a person reading a CI log. */
function describeUi(xml) {
  const all = nodes(xml)
  const packages = [...new Set(all.map(n => n.package).filter(Boolean))]
  const texts = []
  const ids = []
  for (const n of all) {
    const label = (n.text || n['content-desc'] || '').trim()
    if (label && !texts.includes(label)) texts.push(label)
    const id = (n['resource-id'] || '').trim()
    if (id && !ids.includes(id)) ids.push(id)
  }
  const anr = texts.find(t => /isn['’]t responding|not responding/i.test(t)) || null
  return { packages, anr, texts: texts.slice(0, 60), ids: ids.slice(0, 60), empty: all.length === 0 }
}

/** Pure: Markdown lines for $GITHUB_STEP_SUMMARY. */
function summaryLines(d, heading) {
  const lines = [`#### ${heading}`, '']
  if (d.empty) return [...lines, 'The screen dump was empty (uiautomator could not read the screen).', '']
  lines.push(`- In front: ${d.packages.map(p => '`' + p + '`').join(', ') || 'unknown'}`)
  if (d.anr) lines.push(`- **System dialog:** ${d.anr}`)
  lines.push(`- Visible text: ${d.texts.length ? d.texts.map(t => JSON.stringify(t)).join(', ') : 'none'}`)
  lines.push(`- Ids: ${d.ids.length ? d.ids.map(i => '`' + i + '`').join(', ') : 'none'}`)
  lines.push('')
  return lines
}

module.exports = { describeUi, summaryLines }

if (require.main === module) {
  let xml = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', c => { xml += c })
  process.stdin.on('end', () => {
    const heading = process.argv[2] || 'Screen'
    process.stdout.write(summaryLines(describeUi(xml), heading).join('\n') + '\n')
  })
}
