/* istanbul ignore file -- feedSpanArgs is also stringified into an inline <script>; coverage counters would break it. */
/**
 * The Events feed's first `get_feed_span` call (#184), as one pure function
 * with no imports and no outside references, so app/+html.tsx can inline its
 * source (`feedSpanArgs.toString()`) and start the request before the app
 * bundle loads. The hook's own span (useMonthEvents) must equal it for the
 * same clock; __tests__/feedFirstSpan.test.ts checks that.
 *
 * - Narrow (phone): the month(s) of the current Sunday-to-Saturday week, as
 *   the week strip shows them.
 * - Wide (≥ the sidebar breakpoint): this month plus the next 3.
 * Bounds are local midnights as UTC instants (utils/monthKeys monthStartIso).
 * Written in ES5 on purpose: it runs as-is in the page's <head>.
 */
export function feedSpanArgs(nowMs: number, wide: boolean, maxAgeMs: number): FeedSpanArgs {
  var now = new Date(nowMs)
  var y = now.getFullYear()
  var m = now.getMonth()
  var endY = y
  var endM = m
  if (wide) {
    endM = m + 3
  } else {
    var weekStart = new Date(y, m, now.getDate() - now.getDay())
    var weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6)
    y = weekStart.getFullYear()
    m = weekStart.getMonth()
    endY = weekEnd.getFullYear()
    endM = weekEnd.getMonth()
  }
  return {
    p_start: new Date(y, m, 1, 0, 0, 0, 0).toISOString(),
    p_end: new Date(endY, endM + 1, 1, 0, 0, 0, 0).toISOString(),
    p_external_updated_since: new Date(nowMs - maxAgeMs).toISOString(),
  }
}

/** Arguments of `rpc/get_feed_span`. */
export type FeedSpanArgs = { p_start: string; p_end: string; p_external_updated_since: string }
