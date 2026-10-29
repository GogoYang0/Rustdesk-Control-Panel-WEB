import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { saveBlobFile, saveTextFile } from './download'

describe('download layer', () => {
  let click: ReturnType<typeof vi.spyOn>
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    createObjectURL = vi.fn(() => 'blob:test')
    revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    })
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('clicks an anchor with the filename and revokes the URL afterwards', () => {
    saveTextFile('audit-org-1.csv', 'a,b\n1,2\n')

    expect(click).toHaveBeenCalledTimes(1)
    const clicked = click.mock.contexts[0] as HTMLAnchorElement
    expect(clicked).toBeInstanceOf(HTMLAnchorElement)
    expect(clicked.download).toBe('audit-org-1.csv')
    expect(clicked.href).toContain('blob:test')
    expect(document.querySelectorAll('a')).toHaveLength(0)

    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toBe('text/csv;charset=utf-8')
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })

  it('saves an arbitrary blob and sanitizes the fallback filename', () => {
    saveBlobFile('../evil.zip', new Blob(['zip'], { type: 'application/octet-stream' }))
    const clicked = click.mock.contexts[0] as HTMLAnchorElement
    expect(clicked.download).toBe('.._evil.zip')
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toBe('application/octet-stream')
  })
})
