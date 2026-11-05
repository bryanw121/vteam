import { parseInline, parseLegalMarkdown, spansText } from '../utils/legalMarkdown'
import { PRIVACY_MARKDOWN, TERMS_MARKDOWN } from '../constants/legal'

describe('parseInline', () => {
  it('splits bold and placeholders', () => {
    expect(parseInline('**Effective date:** \\[fill in on publish\\] ok')).toEqual([
      { text: 'Effective date:', bold: true },
      { text: ' ' },
      { text: '[fill in on publish]', placeholder: true },
      { text: ' ok' },
    ])
  })
  it('leaves plain text alone', () => {
    expect(parseInline('plain')).toEqual([{ text: 'plain' }])
  })
})

describe('parseLegalMarkdown', () => {
  it('reads titles, headings, paragraphs, lists and tables', () => {
    const blocks = parseLegalMarkdown([
      '# Title', '', 'Oct 27', '', '## Section', 'Line one', 'continues.', '',
      '- a', '- **b**', '', '| H1 | H2 |', '| --- | --- |', '| x | y |', '| z | w |',
    ].join('\n'))
    expect(blocks.map(b => b.type)).toEqual(['title', 'paragraph', 'heading', 'paragraph', 'list', 'table'])
    expect(spansText((blocks[3] as Extract<typeof blocks[number], { type: 'paragraph' }>).spans)).toBe('Line one continues.')
    const table = blocks[5] as Extract<typeof blocks[number], { type: 'table' }>
    expect(table.header.map(spansText)).toEqual(['H1', 'H2'])
    expect(table.rows.map(r => r.map(spansText))).toEqual([['x', 'y'], ['z', 'w']])
  })

  it.each([['terms', TERMS_MARKDOWN], ['privacy', PRIVACY_MARKDOWN]])('renders the %s text without losing content', (_n, md) => {
    const blocks = parseLegalMarkdown(md)
    expect(blocks[0].type).toBe('title')
    const words = (s: string) => s.replace(/[*\\#|\-[\]]/g, ' ').split(/\s+/).filter(Boolean).length
    const rendered = blocks.map(b => {
      if (b.type === 'list') return b.items.map(spansText).join(' ')
      if (b.type === 'table') return [b.header, ...b.rows].map(r => r.map(spansText).join(' ')).join(' ')
      return spansText(b.spans)
    }).join(' ')
    expect(words(rendered)).toBe(words(md))
    expect(blocks.some(b => b.type !== 'list' && b.type !== 'table' && b.spans.some(s => s.placeholder))).toBe(true)
  })
})
