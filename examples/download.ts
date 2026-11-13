/** Save a blob or text as a file through a temporary link. */
export function download(content: Blob | string, filename: string) {
  const blob = typeof content === 'string' ? new Blob([content], { type: 'image/svg+xml' }) : content
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Pixel size of a PNG blob, for status messages. */
export async function imageSize(blob: Blob) {
  const bitmap = await createImageBitmap(blob)
  const size = `${bitmap.width} × ${bitmap.height} px`
  bitmap.close()
  return size
}
