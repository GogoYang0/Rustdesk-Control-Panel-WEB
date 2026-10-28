// Token strategy (design D2): the access token lives only in memory, the refresh
// token in localStorage. Refreshes are single-flight inside a tab and serialised
// across tabs — the server rotates the refresh token, and replaying an old one
// revokes the whole family, which would sign every tab out at once.
const REFRESH_KEY = 'rdp-panel-refresh'
const LOCK_KEY = 'rdp-panel-refresh-lock'
const STALE_LOCK_MS = 30_000

let accessToken: string | null = null
let refreshing: Promise<RefreshResult> | null = null
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

async function withRefreshLock<T>(
  fn: () => Promise<T>,
): Promise<{ acquired: boolean; result?: T }> {
  const mine = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const held = localStorage.getItem(LOCK_KEY)
    const heldAt = held ? Number(held.split('-')[0]) : 0
    if (held && Date.now() - heldAt > STALE_LOCK_MS) {
      // The holder vanished mid-flight. Clearing the lock is safe; refreshing is
      // not, because it may already have consumed the token — the caller treats
      // this round as transient and the next request tries with a fresh read.
      localStorage.removeItem(LOCK_KEY)
      return { acquired: false }
    }
    if (!held) {
      localStorage.setItem(LOCK_KEY, mine)
      // Re-read: two tabs can write in the same tick; only the survivor keeps it.
      await sleep(40)
      if (localStorage.getItem(LOCK_KEY) === mine) {
        try {
          return { acquired: true, result: await fn() }
        } finally {
          if (localStorage.getItem(LOCK_KEY) === mine) localStorage.removeItem(LOCK_KEY)
        }
      }
    }
    await sleep(120)
  }
  return { acquired: false }
}

async function doRefresh(): Promise<RefreshResult> {
  const startedAt = epoch
  const refresh = getRefreshToken()
  if (!refresh) return { access: null, invalid: true }
  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    })
    if (!res.ok) {
      // Only 400/401 mean the server rejected the token. A 5xx, a 429 or a
      // gateway error says nothing about it: the session must survive those, or
      // one blip signs every tab out.
      const invalid = res.status === 400 || res.status === 401
      if (invalid && startedAt === epoch) clearSession()
      return { access: null, invalid }
    }
    const body = (await res.json()) as { data?: TokenPair }
    if (!body.data) {
      // A 2xx means the server consumed and rotated the token. Keeping the old
      // one would replay a spent token on the next attempt.
      if (startedAt === epoch) clearSession()
      return { access: null, invalid: true }
    }
    setTokens(body.data, startedAt)
    return { access: startedAt === epoch ? body.data.access_token : null, invalid: false }
  } catch {
    // A network blip must not wipe a working session: keep the refresh token so
    // the next request can try again.
    return { access: null, invalid: false }
  }
}

/** Exchanges the refresh token for a new pair; concurrent callers share one flight. */
export function refreshAccessToken(): Promise<RefreshResult> {
  if (!refreshing) {
    refreshing = (async () => {
      const startedWith = getRefreshToken()
      const locked = await withRefreshLock(doRefresh)
      if (locked.acquired) return locked.result ?? { access: null, invalid: false }
      // Another tab holds the lock. Never send the token we started with: it may
      // be consumed. Wait for the holder's write (the storage value is the
      // publication) and then rotate once with the *new* token.
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await sleep(120)
        const current = getRefreshToken()
        if (!current) return { access: null, invalid: true }
        if (current === startedWith) continue
        // The holder published a new token. Several waiters may see it at once,
        // so re-race for the lock and read the token *inside* it — refreshing
        // here would let two tabs spend the same one-shot token.
        const retry = await withRefreshLock(doRefresh)
        if (retry.acquired) return retry.result ?? { access: null, invalid: false }
      }
      return { access: null, invalid: false }
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
/** Outcome of one refresh attempt: only `invalid` means the session is over. */
export interface RefreshResult {
  access: string | null
  invalid: boolean
}

export async function bootstrapSession(timeoutMs = 6_000): Promise<void> {
  if (getAccessToken() || !getRefreshToken()) return
  await Promise.race([refreshAccessToken(), sleep(timeoutMs)])
}
