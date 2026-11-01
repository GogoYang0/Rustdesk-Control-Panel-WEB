/**
 * Tab strip state. Tabs keep their first-open order; selecting an existing tab
 * must not move it to the tail. Eviction removes the oldest non-active tab,
 * which is a stable, predictable "expired" candidate.
 */
export function pushTab(tabs: string[], key: string): string[] {
  if (tabs.includes(key)) return tabs
  return [...tabs, key]
}

export function closeTabFrom(tabs: string[], key: string): string[] {
  return tabs.filter((existing) => existing !== key)
}

/** The tab to drop when the strip overflows; never the active one. */
export function evictionCandidate(tabs: string[], active: string): string | null {
  return tabs.find((key) => key !== active) ?? null
}
