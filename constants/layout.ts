/**
 * Layout breakpoints (px, viewport width). Every "is this the wide layout?"
 * decision reads from here so the sidebar layout, the tab layout and the pager
 * all flip at the same width.
 */
export const BREAKPOINTS = {
  /**
   * At or above this width, web shows the sidebar layout and each tab is its own
   * route; below it, web uses the bottom tab bar (and native always does).
   */
  sidebar: 768,
} as const

/** Desktop Events feed: a busy day shows this many games, then "Show N more". */
export const DESKTOP_DAY_GAMES = 4
