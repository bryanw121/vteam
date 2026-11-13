import type { RecapShareTarget } from '../types'

/**
 * Web: Web Share with the picture where the browser can share files (phones);
 * otherwise download the picture and copy the link (desktop).
 */
export async function shareRecap(args: { imageUrl: string; text: string; link: string }): Promise<RecapShareTarget | null> {
  const res = await fetch(args.imageUrl)
  if (!res.ok) throw new Error(`recap picture ${res.status}`)
  const blob = await res.blob()
  const file = new File([blob], 'vteam-game.png', { type: blob.type || 'image/png' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text: `${args.text}\n${args.link}` })
      return 'web-share'
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return null
      throw e
    }
  }
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = 'vteam-game.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
  try { await navigator.clipboard?.writeText(args.link) } catch { /* the download still happened */ }
  return 'download'
}
