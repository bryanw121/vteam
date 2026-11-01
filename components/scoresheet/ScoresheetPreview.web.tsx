import { useRef } from 'react'
import { View } from 'react-native'
import { Button } from '../Button'
import { theme } from '../../constants'
import type { ScoresheetPreviewProps } from '../../types'

/** Web: the finished scoresheet in an isolated frame, printable (and savable as PDF) from the browser. */
export function ScoresheetPreview({ html, title }: ScoresheetPreviewProps) {
  const frame = useRef<HTMLIFrameElement | null>(null)
  return (
    <View style={{ flex: 1, gap: theme.spacing.sm }}>
      <Button
        label="Print or save as PDF"
        icon="print-outline"
        onPress={() => frame.current?.contentWindow?.print()}
        testID="sheet-print"
      />
      <iframe
        ref={frame}
        title={title}
        srcDoc={html}
        style={{ flex: 1, minHeight: 900, width: '100%', border: 0, borderRadius: theme.radius.md, background: theme.colors.white }}
      />
    </View>
  )
}
