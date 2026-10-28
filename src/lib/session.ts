// Token strategy (design D2): the access token lives only in memory, the refresh
// token in localStorage. Refreshes are single-flight inside a tab and serialised
// across tabs — the server rotates the refresh token, and replaying an old one
// revokes the whole family, which would sign every tab out at once.
const REFRESH_KEY = 'rdp-panel-refresh'
const LOCK_KEY = 'rdp-panel-refresh-lock'
const LOCK_TTL_MS = 5_000

let accessToken: string | null = null
let refreshing: Promise<string | null> | null = null
let logoutHandler: (() => void) | null = null
// Bumped on logout: an in-flight refresh that started before the bump must not
// write its result back, or the signed-out session silently returns.
let epoch = 0

export interface TokenPair {
  access_token: string
  refresh_token: string
  expires_in?: number
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function getAccessToken(): string | null {
  return accessToken
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function setTokens(pair: TokenPair, startedAt = epoch): void {
  if (startedAt !== epoch) return
  accessToken = pair.access_token
  localStorage.setItem(REFRESH_KEY, pair.refresh_token)
}

export function clearSession(): void {
  accessToken = null
  localStorage.removeItem(REFRESH_KEY)
}

export function setLogoutHandler(fn: (() => void) | null): void {
  logoutHandler = fn
}

export function logout(): void {
  epoch += 1
  clearSession()
  localStorage.removeItem(LOCK_KEY)
  logoutHandler?.()
}

/** Sign out locally when another tab removed the refresh token. */
function onStorage(event: StorageEvent): void {
  if (event.key !== REFRESH_KEY || event.newValue !== null) return
  epoch += 1
  accessToken = null
  logoutHandler?.()
}

export function watchSessionAcrossTabs(): void {
  window.addEventListener('storage', onStorage)
}

async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T | null> {
  const mine = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const held = localStorage.getItem(LOCK_KEY)
    const heldAt = held ? Number(held.split('-')[0]) : 0
    if (!held || Date.now() - heldAt > LOCK_TTL_MS) {
      localStorage.setItem(LOCK_KEY, mine)
      // Re-read: two tabs can write in the same tick; only the survivor keeps it.
      await sleep(40)
      if (localStorage.getItem(LOCK_KEY) === mine) {
        try {
          return await fn()
        } finally {
          if (localStorage.getItem(LOCK_KEY) === mine) localStorage.removeItem(LOCK_KEY)
        }
      }
    }
    await sleep(120)
  }
  return null
}

async function doRefresh(): Promise<string | null> {
  const startedAt = epoch
  const refresh = getRefreshToken()
  if (!refresh) return null
  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    })
    if (!res.ok) {
      if (startedAt === epoch) clearSession()
      return null
    }
    const body = (await res.json()) as { data?: TokenPair }
    if (!body.data) {
      if (startedAt === epoch) clearSession()
      return null
    }
    setTokens(body.data, startedAt)
    return startedAt === epoch ? body.data.access_token : null
  } catch {
    // A network blip must not wipe a working session: keep the refresh token so
    // the next request can try again.
    return null
  }
}

/** Exchanges the refresh token for a new pair; concurrent callers share one flight. */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const result = await withRefreshLock(doRefresh)
      if (result !== null) return result
      // The lock timed out or this tab never entered: another tab may have
      // rotated the token meanwhile, so try once more with what is stored.
      return doRefresh()
    })().finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

/**
 * A refresh is guaranteed on every reload (the access token is memory-only).
 * Doing it once before the first paint keeps the console from logging a 401 per
 * load. Bounded so a hung panel cannot leave a blank page forever.
 */
export async function bootstrapSession(timeoutMs = 6_000): Promise<void> {
  if (getAccessToken() || !getRefreshToken()) return
  await Promise.race([refreshAccessToken(), sleep(timeoutMs)])
}
