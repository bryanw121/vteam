/** Friends (#15). Limits mirror the friend RPCs in the friends migration. */

/** Best friends per person; set_best_friend refuses the 11th. */
export const BEST_FRIEND_LIMIT = 10
/** Friend requests a person can send per day; send_friend_request refuses the 31st. */
export const FRIEND_REQUESTS_PER_DAY = 30

export const FRIEND_COPY = {
  add: 'Add friend',
  requested: 'Requested',
  respond: 'Respond',
  friends: 'Friends',
  accept: 'Accept',
  decline: 'Decline',
  cancelTitle: 'Cancel friend request?',
  cancelBody: "They won't see your request any more.",
  cancelConfirm: 'Cancel request',
  removeTitle: 'Remove friend?',
  removeBody: "You'll both be removed from each other's friends.",
  removeConfirm: 'Remove',
  bestFriend: 'Best friend',
  bestFriendHint: 'Only you can see who your best friends are.',
  limitReached: "You've sent a lot of friend requests. Try again later.",
  notAllowed: "You can't send this player a friend request.",
  bestFriendLimit: `You can have up to ${BEST_FRIEND_LIMIT} best friends.`,
  gone: 'That request is no longer available.',
} as const
