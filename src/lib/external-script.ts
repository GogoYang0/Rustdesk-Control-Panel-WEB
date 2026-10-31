const scripts = new Map<string, Promise<void>>()

/** Loads a provider script once; concurrent callers share the same request. */
export function loadExternalScript(
  url: string,
  timeoutMs = 10_000,
  isReady?: () => boolean,
): Promise<void> {
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
      // A proxy can answer 200 with an empty/error body; caching that success
      // would make every retry fail without reloading the script.
      if (isReady && !isReady()) {
        script.remove()
        reject(new Error('script global missing'))
        return
      }
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
