import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CHAT_IMAGES_BUCKET, CHAT_IMAGE_SIGNED_URL_TTL_SEC } from '../constants'
import { chatImageRef } from '../utils/chatUtils'

/**
 * Signed URLs for chat images, shared by every bubble and reused until shortly
 * before they expire. Storage only signs an object for its uploader or a
 * member of a conversation whose message references it (RLS on storage.objects).
 */
type Entry = { url: string; expiresAt: number }
const cache = new Map<string, Entry>()
const inflight = new Map<string, Promise<string | null>>()
const REFRESH_MARGIN_MS = 5 * 60 * 1000

function cached(path: string): string | null {
  const hit = cache.get(path)
  return hit && hit.expiresAt - REFRESH_MARGIN_MS > Date.now() ? hit.url : null
}

async function signChatImage(path: string): Promise<string | null> {
  const hit = cached(path)
  if (hit) return hit
  const running = inflight.get(path)
  if (running) return running
  const p = (async () => {
    const { data, error } = await supabase.storage.from(CHAT_IMAGES_BUCKET).createSignedUrl(path, CHAT_IMAGE_SIGNED_URL_TTL_SEC)
    if (error || !data?.signedUrl) return null
    cache.set(path, { url: data.signedUrl, expiresAt: Date.now() + CHAT_IMAGE_SIGNED_URL_TTL_SEC * 1000 })
    return data.signedUrl
  })().finally(() => inflight.delete(path))
  inflight.set(path, p)
  return p
}

/** A displayable URI for a message's `image_url` (null while signing, or if it can't be read). */
export function useChatImageUrl(imageUrl: string | null | undefined): string | null {
  const ref = chatImageRef(imageUrl)
  const path = ref?.kind === 'path' ? ref.path : null
  const direct = ref?.kind === 'direct' ? ref.uri : null
  const [signed, setSigned] = useState<string | null>(() => (path ? cached(path) : null))

  useEffect(() => {
    if (!path) return
    let cancelled = false
    setSigned(cached(path))
    void signChatImage(path).then(url => { if (!cancelled) setSigned(url) })
    return () => { cancelled = true }
  }, [path])

  return direct ?? (path ? signed : null)
}

/** Test hook: forget cached URLs. */
export function __resetChatImageCache(): void {
  cache.clear()
  inflight.clear()
}
