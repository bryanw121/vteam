import type { LegalBlock, LegalSpan } from '../types'

/**
 * Parses the small Markdown subset used by constants/legal.ts: `#` title,
 * `##` headings, paragraphs (blank-line separated), `- ` bullets, pipe tables
 * and `**bold**`. `\[...\]` (escaped brackets) marks a placeholder.
 * Anything else renders as plain paragraph text, so a typo never hides content.
 */
export function parseLegalMarkdown(md: string): LegalBlock[] {
  const blocks: LegalBlock[] = []
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  let paragraph: string[] = []
  let list: string[] = []
  let table: string[] = []

  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', spans: parseInline(paragraph.join(' ')) })
    if (list.length) blocks.push({ type: 'list', items: list.map(parseInline) })
    if (table.length) {
      const rows = table.map(splitRow).filter(cells => !cells.every(c => /^:?-{3,}:?$/.test(c)))
      const [header = [], ...body] = rows
      blocks.push({ type: 'table', header: header.map(parseInline), rows: body.map(r => r.map(parseInline)) })
    }
    paragraph = []
    list = []
    table = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    if (line.startsWith('|')) {
      if (!table.length) flush()
      table.push(line)
      continue
    }
    if (table.length) flush()
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      blocks.push({ type: heading[1].length === 1 ? 'title' : 'heading', spans: parseInline(heading[2]) })
      continue
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      if (paragraph.length) flush()
      list.push(bullet[1])
      continue
    }
    if (list.length) flush()
    paragraph.push(line)
  }
  flush()
  return blocks
}

function splitRow(line: string): string[] {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
}

/** `**bold**` and `\[placeholder\]` within one line of text. */
export function parseInline(text: string): LegalSpan[] {
  const spans: LegalSpan[] = []
  const re = /\*\*(.+?)\*\*|\\\[(.+?)\\\]/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) spans.push({ text: text.slice(last, m.index) })
    if (m[1] !== undefined) spans.push({ text: m[1], bold: true })
    else spans.push({ text: `[${m[2]}]`, placeholder: true })
    last = m.index + m[0].length
  }
  if (last < text.length) spans.push({ text: text.slice(last) })
  return spans
}

/** Plain text of some spans (accessibility labels, tests). */
export function spansText(spans: LegalSpan[]): string {
  return spans.map(s => s.text).join('')
}
