// Browser-only helpers for the component export methods. They are called from methods, never during rendering.
import type { ChartTone } from '../core/types.js'
import type { SvgExportThemeInput, SvgToneColors } from '../core/exportSvg.js'

/** Largest canvas side and area accepted for PNG export. Browsers fail silently above their own limits. */
export const maxCanvasSide = 16_384
export const maxCanvasArea = 268_435_456

const properties: Record<string, string> = {
  surface: '--vw-surface', surfaceMuted: '--vw-surface-muted', text: '--vw-text', muted: '--vw-muted', border: '--vw-border',
  grid: '--vw-grid', edge: '--vw-edge', accent: '--vw-accent', onSolid: '--vw-on-solid', markerInk: '--vw-marker-ink', baseline: '--vw-baseline',
  marker: '--vw-marker', now: '--vw-now', load: '--vw-load', loadOverload: '--vw-load-overload',
  loadCapacity: '--vw-load-capacity', dependencyHighlight: '--vw-dependency-highlight',
  nonWorking: '--vw-non-working', critical: '--vw-critical', float: '--vw-float', deadline: '--vw-deadline', status: '--vw-status',
  baseline2: '--vw-baseline-2', baseline3: '--vw-baseline-3',
}

/** Read the `--vw-*` custom properties in effect on an element; unset properties keep the export defaults. */
export function readExportTheme(element: Element, overrides: SvgExportThemeInput = {}): SvgExportThemeInput {
  const style = getComputedStyle(element)
  const read = (name: string) => style.getPropertyValue(name).trim() || undefined
  const theme: Record<string, unknown> = {}
  for (const [key, property] of Object.entries(properties)) theme[key] = read(property)
  const tones: Partial<Record<ChartTone, Partial<SvgToneColors>>> = {}
  for (const tone of ['teal', 'blue', 'amber', 'violet'] as const) {
    tones[tone] = {
      ink: read(`--vw-${tone}-ink`), line: read(`--vw-${tone}-line`), pale: read(`--vw-${tone}-pale`), solid: read(`--vw-${tone}-solid`),
      ...overrides.tones?.[tone],
    }
  }
  const { tones: _ignored, ...rest } = overrides
  return { ...theme, ...rest, tones } as SvgExportThemeInput
}

export function exportFont(element: Element) {
  return getComputedStyle(element).fontFamily || undefined
}

/** The pixel size written on the root element by the core SVG builders. */
function svgSize(svg: string) {
  const root = /^<svg\b[^>]*>/.exec(svg)?.[0] ?? ''
  const width = Number(/\swidth="([^"]+)"/.exec(root)?.[1])
  const height = Number(/\sheight="([^"]+)"/.exec(root)?.[1])
  if (!(width > 0) || !(height > 0)) throw new Error('The SVG has no pixel size')
  return { width, height }
}

/** Rasterize an SVG document to a PNG blob at `scale` device pixels per CSS pixel. */
export async function rasterizeSvg(svg: string, scale = 1): Promise<Blob> {
  if (!Number.isFinite(scale) || scale <= 0 || scale > 8) throw new RangeError('scale must be greater than 0 and at most 8')
  const { width, height } = svgSize(svg)
  const pixelWidth = Math.ceil(width * scale), pixelHeight = Math.ceil(height * scale)
  if (pixelWidth > maxCanvasSide || pixelHeight > maxCanvasSide || pixelWidth * pixelHeight > maxCanvasArea) {
    throw new RangeError(`A ${pixelWidth} × ${pixelHeight} px PNG exceeds the maximum canvas size of ${maxCanvasSide} px per side`
      + ` and ${maxCanvasArea} px in total; lower scale or export a smaller time or row range`)
  }
  if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('PNG export requires a browser')
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const image = new Image()
  try {
    image.src = url
    await image.decode()
  } finally {
    URL.revokeObjectURL(url)
  }
  const canvas = document.createElement('canvas')
  canvas.width = pixelWidth
  canvas.height = pixelHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('The browser could not create a canvas for PNG export')
  context.drawImage(image, 0, 0, pixelWidth, pixelHeight)
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The browser could not encode the PNG')), 'image/png'))
}
