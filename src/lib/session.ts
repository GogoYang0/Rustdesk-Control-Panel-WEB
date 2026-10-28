// Token strategy (design D2): the access token lives only in memory, the refresh
// token in localStorage. Refreshes are single-flight inside a tab and serialised
// across tabs — the server rotates the refresh token, and replaying an old one
// revokes the whole family, which would sign every tab out at once.
const REFRESH_KEY = 'rdp-panel-refresh'
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

/**
 * Web Locks is the only mechanism here that gives a real mutex: it serialises tabs
 * and the browser releases it when a tab dies. localStorage cannot — it has no
 * compare-and-swap, so two tabs can both read an empty key, both write, and both
 * believe they won. Refreshing without this guarantee is skipped (see
 * `refreshAccessToken`), because a replayed one-shot token revokes the family.
 */
function hasRefreshLocks(): boolean {
  return typeof navigator !== 'undefined' && 'locks' in navigator
}

async function withRefreshLock<T>(
  fn: () => Promise<T>,
): Promise<{ acquired: boolean; result?: T }> {
  // `ifAvailable` keeps the "someone else is refreshing" answer immediate; the
  // caller then follows their published token instead of racing them.
  let acquired = false
  let result: T | undefined
  await navigator.locks.request('rdp-panel-refresh', { ifAvailable: true }, async (lock) => {
    if (!lock) return
    acquired = true
    result = await fn()
  })
  return acquired ? { acquired, result } : { acquired: false }
}

async function doRefresh(): Promise<RefreshResult> {
  const startedAt = epoch
  const refresh = getRefreshToken()
  if (!refresh) return { access: null, invalid: true }
  const tag = fingerprint(refresh)
  const settle = () => localStorage.removeItem(INFLIGHT_KEY)
  if (localStorage.getItem(INFLIGHT_KEY) === tag) {
    // An earlier attempt with this exact token never reported back. It may have
    // been consumed, so refuse rather than replay. Drop the token before the
    // marker: dying in between must not leave a token without its marker.
    if (startedAt === epoch) clearSession()
    settle()
    return { access: null, invalid: true }
  }
  localStorage.setItem(INFLIGHT_KEY, tag)
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
        // Same order as above: token first, marker second.
        if (startedAt === epoch) clearSession()
        settle()
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
      if (startedAt === epoch) clearSession()
      settle()
      return { access: null, invalid: true }
    }
    // Publish the new pair first, then drop the marker. A tab that dies in
    // between leaves the marker behind, which makes the next attempt fail closed
    // instead of replaying the token the server already consumed.
    setTokens(pair, startedAt)
    settle()
    return { access: startedAt === epoch ? pair.access_token : null, invalid: false }
  } catch {
    // A network blip must not wipe a working session: keep the refresh token so
    // the next request can try again. The marker stays too — the request may
    // still have reached the server, and a publish failure lands here as well.
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
      if (!hasRefreshLocks()) {
        // No real mutex means two tabs can both spend the same one-shot token,
        // and a replay revokes the whole family. The API has no idempotent
        // refresh to recover with, so the only safe answer is a fresh sign-in.
        // Web Locks is available in every browser this console targets.
        if (startedWith) clearSession()
        return { access: null, invalid: true }
      }
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
