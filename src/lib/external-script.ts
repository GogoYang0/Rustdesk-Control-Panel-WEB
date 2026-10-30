const scripts = new Map<string, Promise<void>>()

/** Loads a provider script once; concurrent callers share the same request. */
export function loadExternalScript(url: string, timeoutMs = 10_000): Promise<void> {
  const cached = scripts.get(url)
  if (cached) return cached

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.async = true

    const cleanup = () => {
      script.onload = null
      script.onerror = null
      window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => {
      cleanup()
      script.remove()
      reject(new Error('script timeout'))
    }, timeoutMs)

    script.onload = () => {
      cleanup()
      resolve()
    }
    script.onerror = () => {
      cleanup()
      script.remove()
      reject(new Error('script failed'))
    }
    document.head.appendChild(script)
  })

  scripts.set(url, promise)
  void promise.catch(() => scripts.delete(url))
  return promise
}
