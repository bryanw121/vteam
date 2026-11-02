import type { ImageSourcePropType } from 'react-native'
import type { BadgeType } from '../types'

/** Approved catalog art, bundled for web and native; no image-generation or storage request on render. */
export const BADGE_ARTWORK: Record<BadgeType, Record<number, ImageSourcePropType>> = {
  event_attendee: {
    1: require('../assets/badges/event_attendee_tier1_bronze.png'),
    2: require('../assets/badges/event_attendee_tier2_silver.png'),
    3: require('../assets/badges/event_attendee_tier3_gold.png'),
    4: require('../assets/badges/event_attendee_tier4_platinum.png'),
    5: require('../assets/badges/event_attendee_tier5_diamond.png'),
  },
  event_host: {
    1: require('../assets/badges/event_host_tier1_bronze.png'),
    2: require('../assets/badges/event_host_tier2_silver.png'),
    3: require('../assets/badges/event_host_tier3_gold.png'),
  },
  cheers_received: {
    1: require('../assets/badges/cheers_received_tier1_bronze.png'),
    2: require('../assets/badges/cheers_received_tier2_silver.png'),
    3: require('../assets/badges/cheers_received_tier3_gold.png'),
  },
  cheers_given: {
    1: require('../assets/badges/cheers_given_tier1_bronze.png'),
    2: require('../assets/badges/cheers_given_tier2_silver.png'),
    3: require('../assets/badges/cheers_given_tier3_gold.png'),
  },
  spike_cheer: {
    1: require('../assets/badges/spike_cheer_tier1_bronze.png'),
    2: require('../assets/badges/spike_cheer_tier2_silver.png'),
    3: require('../assets/badges/spike_cheer_tier3_gold.png'),
  },
  serve_cheer: {
    1: require('../assets/badges/serve_cheer_tier1_bronze.png'),
    2: require('../assets/badges/serve_cheer_tier2_silver.png'),
    3: require('../assets/badges/serve_cheer_tier3_gold.png'),
  },
  block_cheer: {
    1: require('../assets/badges/block_cheer_tier1_bronze.png'),
    2: require('../assets/badges/block_cheer_tier2_silver.png'),
    3: require('../assets/badges/block_cheer_tier3_gold.png'),
  },
  set_cheer: {
    1: require('../assets/badges/set_cheer_tier1_bronze.png'),
    2: require('../assets/badges/set_cheer_tier2_silver.png'),
    3: require('../assets/badges/set_cheer_tier3_gold.png'),
  },
  dig_pass_cheer: {
    1: require('../assets/badges/dig_pass_cheer_tier1_bronze.png'),
    2: require('../assets/badges/dig_pass_cheer_tier2_silver.png'),
    3: require('../assets/badges/dig_pass_cheer_tier3_gold.png'),
  },
  communication_cheer: {
    1: require('../assets/badges/communication_cheer_tier1_bronze.png'),
    2: require('../assets/badges/communication_cheer_tier2_silver.png'),
    3: require('../assets/badges/communication_cheer_tier3_gold.png'),
  },
  beta_tester: {
    1: require('../assets/badges/beta_tester_tier1_special.png'),
  },
  tournament_director: {
    1: require('../assets/badges/tournament_director_tier1_special.png'),
  },
  profile_complete: {
    1: require('../assets/badges/profile_complete_tier1_special.png'),
  },
  vex_spirit: {
    1: require('../assets/badges/vex_spirit_tier1_special.png'),
  },
}
