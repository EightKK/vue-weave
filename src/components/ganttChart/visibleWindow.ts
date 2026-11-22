// Reporting of the rendered window of GanttChart (`visible-window-change`): after a trailing delay that a long scroll
// cannot postpone beyond about four delays, and only when the window changed since the last report. Timers run only
// after mounting, so nothing is scheduled on the server.
import type { TimelineVisibleWindow } from '../../core/windowedData.js'

export interface VisibleWindowReportOptions {
  /** The rendered window, or undefined while the chart shows no valid data. */
  window: () => TimelineVisibleWindow | undefined
  /** `visibleWindowDelay` in milliseconds; a value that is not finite counts as 100. */
  delay: () => number | undefined
  mounted: () => boolean
  report: (window: TimelineVisibleWindow) => void
}

export function visibleWindowReport(options: VisibleWindowReportOptions) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let since = 0
  let reported = ''
  function report() {
    timer = undefined
    const value = options.window()
    if (!options.mounted() || !value) return
    const key = JSON.stringify([value.start, value.end, value.rowIds, value.expandedIds])
    if (key === reported) return
    reported = key
    options.report({ start: value.start, end: value.end, rowIds: [...value.rowIds], expandedIds: [...value.expandedIds] })
  }
  return {
    /** Report the window once it settles; call it whenever the window may have changed. */
    schedule() {
      if (!options.mounted()) return
      const setting = options.delay()
      const delay = Math.max(0, Number.isFinite(setting) ? setting! : 100)
      if (timer === undefined) since = Date.now()
      else if (Date.now() - since < 3 * delay) clearTimeout(timer)
      else return
      timer = setTimeout(report, delay)
    },
    stop() {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
    },
  }
}
