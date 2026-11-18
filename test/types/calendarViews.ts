// Type-level checks for marker ranges, calendar zoom presets and Intl time formatting. Checked by `npm run typecheck`.
import {
  calendarBands, calendarZoomPresets, intlTimeFormatter, renderTimelineSvg, type CalendarZoomLevel, type CalendarZoomPreset,
  type TimelineMarkerRange, type TimelineSvgOptions, type TimelineZoomPreset, type TimeScale,
} from '../../src/core/index'

declare const scale: TimeScale
const range = { start: 0, end: 86_400_000 }

// A calendar preset is a complete TimelineZoomPreset, so the array goes straight into the zoomPresets prop.
const presets: CalendarZoomPreset[] = calendarZoomPresets(range, { locale: ['de-DE', 'en'], timeZone: 'Europe/Berlin', levels: ['days', 'weeks'] })
const zoomPresets: readonly TimelineZoomPreset[] = presets
const level: CalendarZoomLevel = presets[0]!.id
const formatTime: (time: number) => string = presets[0]!.formatTime
// @ts-expect-error an unknown level is not a CalendarZoomLevel
calendarZoomPresets(range, { levels: ['decades'] })
void zoomPresets
void level
void formatTime

const format: (time: number) => string = intlTimeFormatter({ locale: 'ja-JP', timeZone: 'Asia/Tokyo', format: { dateStyle: 'medium' } })
void format
calendarBands(range, 'month', { locale: 'fr-FR', labelFormat: { month: 'long' } })

const ranges: TimelineMarkerRange[] = [
  { id: 'freeze', start: 0, end: 1, label: 'Code freeze' },
  { id: 'closed', start: 1, end: 2, label: 'Closed', tone: 'teal', rowIds: ['r1'] },
]
// @ts-expect-error a marker range needs an end; a point in time is a TimelineMarker
const point: TimelineMarkerRange = { id: 'p', start: 0, label: 'Point' }
// @ts-expect-error tones are the ChartTone names
const red: TimelineMarkerRange = { id: 'r', start: 0, end: 1, label: 'Red', tone: 'red' }
void point
void red
const options: TimelineSvgOptions = { markerRanges: ranges, theme: { range: '#fff', rangeInk: '#000', rangeLine: '#888' } }
renderTimelineSvg([], [], [], scale, options)
