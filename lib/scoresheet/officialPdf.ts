/**
 * The finished match written onto the real USA Volleyball scoresheet, as PDF bytes. Draws the
 * marks from officialLayout.ts onto copies of the blank form (usavTemplate.ts) with pdf-lib: no
 * network, no service. Imported lazily (pdf-lib and the form are ~1 MB of script together).
 */
// Use the explicit CommonJS entry: Metro cannot resolve the /cjs directory itself, while the ES
// build resolves tslib as an ES module and fails at runtime.
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib/cjs/index.js'
import type { MatchDoc, MatchState, SheetOp } from '../../types/scoresheet'
import { SHEET_HEIGHT, SHEET_WIDTH, officialLayout } from './officialLayout'
import { USAV_TWO_SET_TEMPLATE } from './usavTemplate'
import { fitText } from './fitText'

/** Pen ink on the printed form: dark blue, so filled-in entries stand out from the form itself. */
const INK = rgb(0.05, 0.14, 0.5)
const PAPER = rgb(1, 1, 1)

type Fonts = { regular: PDFFont; bold: PDFFont }

/** Characters Helvetica can't draw become "?" (pdf-lib throws on them otherwise). */
function printable(font: PDFFont, text: string): string {
  const set = new Set(font.getCharacterSet())
  return Array.from(text.normalize('NFC'), ch => (set.has(ch.codePointAt(0) ?? 0) ? ch : '?')).join('')
}

/**
 * Maps the layout's coordinates (landscape page as read, from the top left) onto a page. The
 * form is a portrait page shown rotated 90°, so the reading position (x, y) is (y, x) in the
 * page's own space and text is turned 90°; plain pages are ordinary landscape pages.
 */
function painter(page: PDFPage, rotated: boolean, fonts: Fonts) {
  const at = (x: number, y: number) => (rotated ? { x: y, y: x } : { x, y: SHEET_HEIGHT - y })
  return (op: SheetOp) => {
    switch (op.kind) {
      case 'text': {
        const font = op.bold ? fonts.bold : fonts.regular
        const { text, size } = fitText(printable(font, op.text), op.size, op.maxWidth, (t, sz) => font.widthOfTextAtSize(t, sz))
        const width = font.widthOfTextAtSize(text, size)
        const x = op.align === 'center' ? op.x - width / 2 : op.align === 'right' ? op.x - width : op.x
        page.drawText(text, { ...at(x, op.y), size, font, color: INK, ...(rotated ? { rotate: degrees(90) } : {}) })
        return
      }
      case 'line':
        page.drawLine({ start: at(op.x1, op.y1), end: at(op.x2, op.y2), thickness: op.width ?? 0.9, color: INK })
        return
      case 'ellipse': {
        const c = at(op.cx, op.cy)
        page.drawEllipse({ ...c, xScale: rotated ? op.ry : op.rx, yScale: rotated ? op.rx : op.ry, borderColor: INK, borderWidth: op.width ?? 0.9 })
        return
      }
      case 'cover': {
        const corner = rotated ? at(op.x, op.y) : at(op.x, op.y + op.h)
        page.drawRectangle({ ...corner, width: rotated ? op.h : op.w, height: rotated ? op.w : op.h, color: PAPER })
        return
      }
    }
  }
}

/** The completed official scoresheet for a match (any format: extra sets go on extra sheets). */
export async function officialScoresheetPdf(doc: MatchDoc, state: MatchState): Promise<Uint8Array> {
  const template = await PDFDocument.load(USAV_TWO_SET_TEMPLATE)
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${doc.setup.teams.A.name || 'Team A'} vs ${doc.setup.teams.B.name || 'Team B'} · USA Volleyball scoresheet`)
  pdf.setCreator('vteam scorekeeper')
  const fonts: Fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) }
  const layout = officialLayout(doc, state, { measure: (text, size, bold) => (bold ? fonts.bold : fonts.regular).widthOfTextAtSize(printable(fonts.regular, text), size) })

  const pages: PDFPage[] = []
  for (const kind of layout.pages) {
    if (kind === 'form') {
      const [copy] = await pdf.copyPages(template, [0])
      pages.push(pdf.addPage(copy))
    } else {
      pages.push(pdf.addPage([SHEET_WIDTH, SHEET_HEIGHT]))
    }
  }
  const paint = layout.pages.map((kind, i) => painter(pages[i], kind === 'form', fonts))
  for (const op of layout.ops) paint[op.page](op)
  return pdf.save()
}

/** File name for the export: "Aces-vs-Blockers-2026-11-02-usav-scoresheet.pdf". */
export function officialFileName(doc: MatchDoc): string {
  const slug = (s: string) => s.trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)
  const parts = [slug(doc.setup.teams.A.name) || 'Team-A', 'vs', slug(doc.setup.teams.B.name) || 'Team-B', doc.setup.info.date ?? '', 'usav-scoresheet']
  return `${parts.filter(Boolean).join('-')}.pdf`
}
