import { Fragment, useMemo } from 'react'
import { View } from 'react-native'
import { Text } from '../ui/Text'
import { shared, theme } from '../../constants'
import { parseLegalMarkdown, spansText } from '../../utils/legalMarkdown'
import type { LegalSpan } from '../../types'

type Props = {
  /** Markdown subset from constants/legal.ts. The leading `#` title is rendered by the screen header, not here. */
  markdown: string
}

function Spans({ spans }: { spans: LegalSpan[] }) {
  return (
    <>
      {spans.map((s, i) => (
        <Text key={i} style={s.placeholder ? shared.legalPlaceholder : s.bold ? shared.legalBold : undefined}>
          {s.text}
        </Text>
      ))}
    </>
  )
}

/**
 * A Terms / Privacy document: headings, paragraphs, bullets, bold, and tables
 * (each table row is a small card, readable at phone width). Placeholders such
 * as "[fill in on publish]" are highlighted so they're hard to miss.
 */
export function LegalDocument({ markdown }: Props) {
  const blocks = useMemo(() => parseLegalMarkdown(markdown), [markdown])
  return (
    <View style={shared.legalBody}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'title':
            return null
          case 'heading':
            return (
              <Text key={i} style={shared.legalHeading} accessibilityRole="header">
                <Spans spans={block.spans} />
              </Text>
            )
          case 'paragraph':
            // The line right under the title is the document's date.
            if (i === 1 && blocks[0]?.type === 'title') {
              return <Text key={i} style={shared.legalUpdated}>Last updated {spansText(block.spans)}</Text>
            }
            return (
              <Text key={i} style={shared.legalText} selectable>
                <Spans spans={block.spans} />
              </Text>
            )
          case 'list':
            return (
              <View key={i} style={{ gap: theme.spacing.xs }}>
                {block.items.map((item, j) => (
                  <View key={j} style={shared.legalListItem}>
                    <Text style={shared.legalBullet}>•</Text>
                    <Text style={[shared.legalText, { flex: 1 }]} selectable>
                      <Spans spans={item} />
                    </Text>
                  </View>
                ))}
              </View>
            )
          case 'table':
            return (
              <View key={i} style={{ gap: theme.spacing.sm }}>
                {block.rows.map((row, j) => (
                  <View key={j} style={shared.legalTableRow}>
                    {row.map((cell, k) => (
                      <Fragment key={k}>
                        {k === 0 ? (
                          <Text style={[shared.legalText, shared.legalBold]} selectable><Spans spans={cell} /></Text>
                        ) : (
                          <View>
                            <Text style={shared.legalTableLabel}>{spansText(block.header[k] ?? [])}</Text>
                            <Text style={shared.legalText} selectable><Spans spans={cell} /></Text>
                          </View>
                        )}
                      </Fragment>
                    ))}
                  </View>
                ))}
              </View>
            )
        }
      })}
    </View>
  )
}
