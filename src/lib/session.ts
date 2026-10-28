// Token strategy (design D2): the access token lives only in memory, the refresh
// token in localStorage. Refreshes are single-flight inside a tab and serialised
// across tabs — the server rotates the refresh token, and replaying an old one
// revokes the whole family, which would sign every tab out at once.
const REFRESH_KEY = 'rdp-panel-refresh'
const LOCK_KEY = 'rdp-panel-refresh-lock'
const STALE_LOCK_MS = 30_000
// Cross-tab marker: a refresh whose outcome is unknown may already have consumed
// the token. Re-sending it would be a replay (which revokes the whole family), so
// the next attempt fails closed instead and asks for a fresh sign-in.
const INFLIGHT_KEY = 'rdp-panel-refresh-inflight'

function fingerprint(token: string): string {
  let hash = 0
  for (let i = 0; i < token.length; i += 1) hash = (hash * 31 + token.charCodeAt(i)) | 0
  return `${token.length}:${hash}`
}

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
  // Web Locks gives real mutual exclusion and releases the lock if the tab dies,
  // which the localStorage key cannot do. `ifAvailable` keeps the "someone else
  // is refreshing" answer immediate; the caller then follows their published
  // token instead of racing them.
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    let acquired = false
    let result: T | undefined
    await navigator.locks.request('rdp-panel-refresh', { ifAvailable: true }, async (lock) => {
      if (!lock) return
      acquired = true
      result = await fn()
    })
    return acquired ? { acquired, result } : { acquired: false }
  }
  return lockViaStorage(fn)
}

async function lockViaStorage<T>(fn: () => Promise<T>): Promise<{ acquired: boolean; result?: T }> {
  const mine = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  // Short acquire budget: the caller has its own wait loop for a held lock.
  for (let attempt = 0; attempt < 5; attempt += 1) {
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
  const tag = fingerprint(refresh)
  if (localStorage.getItem(INFLIGHT_KEY) === tag) {
    // An earlier attempt with this exact token never reported back. It may have
    // been consumed, so refuse rather than replay.
    localStorage.removeItem(INFLIGHT_KEY)
    if (startedAt === epoch) clearSession()
    return { access: null, invalid: true }
  }
  localStorage.setItem(INFLIGHT_KEY, tag)
  const settle = () => localStorage.removeItem(INFLIGHT_KEY)
  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    })
    if (!res.ok) {
      // Only 400/401 mean the server rejected the token. A 5xx, a 429 or a
      // gateway error says nothing about it: the session must survive those, or
      // one blip signs every tab out. The marker then stays, so the retry fails
      // closed instead of assuming the token was not spent.
      const invalid = res.status === 400 || res.status === 401
      if (invalid) {
        settle()
        if (startedAt === epoch) clearSession()
      }
      return { access: null, invalid }
    }
    // A 2xx means the token was consumed. An unparsable body is therefore just
    // as fatal as a missing pair: keeping the old token would replay it.
    let body: unknown
    try {
      body = await res.json()
    } catch {
      body = null
    }
    const pair = readPair(body)
    if (!pair) {
      // A 2xx means the server consumed and rotated the token. Keeping the old
      // one would replay a spent token on the next attempt.
      settle()
      if (startedAt === epoch) clearSession()
      return { access: null, invalid: true }
    }
    settle()
    setTokens(pair, startedAt)
    return { access: startedAt === epoch ? pair.access_token : null, invalid: false }
  } catch {
    // A network blip must not wipe a working session: keep the refresh token so
    // the next request can try again. The marker stays too — the request may
    // still have reached the server.
    return { access: null, invalid: false }
  }
}

/** The response is only usable when it is an object carrying two non-empty strings. */
function readPair(body: unknown): TokenPair | null {
  if (typeof body !== 'object' || body === null) return null
  const data = (body as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return null
  const { access_token: access, refresh_token: refresh } = data as Record<string, unknown>
  if (typeof access !== 'string' || access === '') return null
  if (typeof refresh !== 'string' || refresh === '') return null
  return { access_token: access, refresh_token: refresh }
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
      // ~3s budget: long enough for another tab's refresh, short enough that a
      // stuck holder surfaces as a transient error instead of a hung request.
      for (let attempt = 0; attempt < 25; attempt += 1) {
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
