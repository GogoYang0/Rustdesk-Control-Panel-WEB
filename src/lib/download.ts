/**
 * Saves a blob through a temporary object URL. The URL is revoked on the next
 * task: revoking synchronously can cancel the download in some browsers.
 */
export function saveBlobFile(filename: string, blob: Blob): void {
  const safe = filename.replace(/[\\/:*?"<>|\r\n]/g, '_').trim() || 'download'
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = safe
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function saveTextFile(filename: string, text: string, mime = 'text/csv'): void {
  saveBlobFile(filename, new Blob([text], { type: `${mime};charset=utf-8` }))
}
