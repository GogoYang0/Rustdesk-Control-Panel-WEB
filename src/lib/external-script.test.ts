import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadExternalScript } from './external-script'

function findScript(url: string): HTMLScriptElement | null {
  return document.head.querySelector(`script[src="${url}"]`)
}

afterEach(() => {
  vi.useRealTimers()
  document.head.querySelectorAll('script').forEach((script) => script.remove())
})

describe('loadExternalScript', () => {
  it('resolves on load and reuses the same request', async () => {
    const url = 'https://static.geetest.com/v4/test-load.js'
    const first = loadExternalScript(url)
    const second = loadExternalScript(url)
    expect(document.head.querySelectorAll(`script[src="${url}"]`)).toHaveLength(1)

    findScript(url)?.dispatchEvent(new Event('load'))
    await expect(first).resolves.toBeUndefined()
    await expect(second).resolves.toBeUndefined()
  })

  it('rejects on error, removes the script and allows a retry', async () => {
    const url = 'https://static.geetest.com/v4/test-error.js'
    const first = loadExternalScript(url)
    findScript(url)?.dispatchEvent(new Event('error'))
    await expect(first).rejects.toThrow('script failed')
    expect(findScript(url)).toBeNull()

    const retry = loadExternalScript(url)
    expect(findScript(url)).not.toBeNull()
    findScript(url)?.dispatchEvent(new Event('load'))
    await expect(retry).resolves.toBeUndefined()
  })

  it('rejects and clears the cache when the expected global is missing', async () => {
    const url = 'https://static.geetest.com/v4/test-missing-global.js'
    const first = loadExternalScript(url, 5000, () => false)
    findScript(url)?.dispatchEvent(new Event('load'))
    await expect(first).rejects.toThrow('script global missing')
    expect(findScript(url)).toBeNull()

    const retry = loadExternalScript(url, 5000, () => true)
    expect(findScript(url)).not.toBeNull()
    findScript(url)?.dispatchEvent(new Event('load'))
    await expect(retry).resolves.toBeUndefined()
  })

  it('times out a script that never settles', async () => {
    vi.useFakeTimers()
    const url = 'https://static.geetest.com/v4/test-timeout.js'
    const promise = loadExternalScript(url, 5000)
    const assertion = expect(promise).rejects.toThrow('script timeout')
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
    expect(findScript(url)).toBeNull()
  })
})
