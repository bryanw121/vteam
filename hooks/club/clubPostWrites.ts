import { supabase } from '../../lib/supabase'

/**
 * The club updates feed's writes (#305), so `ClubPostCard` and its composer call these
 * instead of `supabase.from` directly. Each throws on a Supabase error; RLS checks that the
 * caller is a member (comments, likes) or the owner (posts), and triggers rate-limit them.
 */
export async function setClubPostLike(postId: string, userId: string, liked: boolean): Promise<void> {
  const { error } = liked
    ? await supabase.from('club_post_likes').insert({ club_post_id: postId, user_id: userId })
    : await supabase.from('club_post_likes').delete().eq('club_post_id', postId).eq('user_id', userId)
  if (error) throw error
}

export async function addClubPostComment(postId: string, userId: string, body: string): Promise<void> {
  const { error } = await supabase.from('club_post_comments').insert({ club_post_id: postId, user_id: userId, body })
  if (error) throw error
}

export async function createClubPost(clubId: string, userId: string, body: string): Promise<void> {
  const { error } = await supabase.from('club_posts').insert({ club_id: clubId, created_by: userId, body })
  if (error) throw error
}
