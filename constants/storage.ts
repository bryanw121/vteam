/** Supabase Storage bucket for profile photos. Create this bucket in the Supabase dashboard. */
export const AVATARS_BUCKET = 'avatars'

/** Supabase Storage bucket for club avatars. Create this bucket in the Supabase dashboard. */
export const CLUB_AVATARS_BUCKET = 'club-avatars'

/** Must match the bucket's max file size policy (private `avatars` bucket). */
export const AVATAR_MAX_FILE_BYTES = 3 * 1024 * 1024

/** Signed URL lifetime for private bucket avatars (`profiles.avatar_url` stores the object path). */
export const AVATAR_SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7

/**
 * Private bucket for chat message images. `messages.image_url` stores the object
 * path (`<uid>/<file>`; older rows a former public URL); `useChatImageUrl` signs it.
 */
export const CHAT_IMAGES_BUCKET = 'chat-images'

/** Lifetime of a chat image's signed URL (re-signed 5 minutes before expiry). */
export const CHAT_IMAGE_SIGNED_URL_TTL_SEC = 60 * 60
