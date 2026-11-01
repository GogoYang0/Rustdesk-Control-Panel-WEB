const listeners = new Set<() => void>()
let active = 0

function notify() {
  for (const listener of listeners) listener()
}

export function beginRequest(): void {
  active += 1
  notify()
}

export function endRequest(): void {
  active = Math.max(0, active - 1)
  notify()
}

export function subscribeRequests(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function requestCount(): number {
  return active
}
