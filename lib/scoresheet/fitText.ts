import { HELVETICA_WIDTHS } from './helveticaWidths'

/** Smallest size text on the form shrinks to before it is cut with "…". */
export const MIN_TEXT_SIZE = 4.5

export type TextMeasure = (text: string, size: number, bold?: boolean) => number

/**
 * Fits `text` into `maxWidth` the way the official form does: shrink in quarter
 * points down to MIN_TEXT_SIZE, then cut with "…". Shared by the PDF and the
 * on-screen preview so both show the same thing.
 */
export function fitText(text: string, size: number, maxWidth: number | undefined, measure: (text: string, size: number) => number): { text: string; size: number } {
  if (!maxWidth) return { text, size }
  let s = size
  while (s > MIN_TEXT_SIZE && measure(text, s) > maxWidth) s -= 0.25
  if (measure(text, s) <= maxWidth) return { text, size: s }
  let t = text
  while (t.length > 1 && measure(`${t}…`, s) > maxWidth) t = t.slice(0, -1)
  return { text: `${t.trimEnd()}…`, size: s }
}

/** Helvetica widths without loading a font (for the on-screen preview). */
export const helveticaMeasure: TextMeasure = (text, size, bold = false) => {
  const table = HELVETICA_WIDTHS[bold ? 'bold' : 'regular']
  const fallback = table['n'.charCodeAt(0) - 32]
  let units = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    units += code >= 32 && code <= 126 ? table[code - 32] : ch === '…' ? 1000 : fallback
  }
  return (units / 1000) * size
}
