/**
 * Tab strip state. Tabs are page keys ordered least-recently-used first, so the
 * head is always the eviction candidate and the active tab sits at the tail.
 */
export function pushTab(tabs: string[], key: string): string[] {
  if (tabs[tabs.length - 1] === key) return tabs
  return [...tabs.filter((existing) => existing !== key), key]
}

export function closeTabFrom(tabs: string[], key: string): string[] {
  return tabs.filter((existing) => existing !== key)
}

/** The tab to drop when the strip overflows; never the active one. */
export function evictionCandidate(tabs: string[], active: string): string | null {
  return tabs.find((key) => key !== active) ?? null
}
