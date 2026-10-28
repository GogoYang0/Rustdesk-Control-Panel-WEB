// Token strategy (design D2): the access token lives only in memory, the refresh
// token in localStorage. A page load starts from the refresh token; concurrent
// 401s share one refresh because the server rotates the token and a replay
// revokes the whole family.
const REFRESH_KEY = 'rdp-panel-refresh'

let accessToken: string | null = null
let refreshing: Promise<string | null> | null = null
let logoutHandler: (() => void) | null = null

export interface TokenPair {
  access_token: string
  refresh_token: string
  expires_in?: number
}

export function getAccessToken(): string | null {
  return accessToken
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function setTokens(pair: TokenPair): void {
  accessToken = pair.access_token
  localStorage.setItem(REFRESH_KEY, pair.refresh_token)
}

export function clearSession(): void {
  accessToken = null
  localStorage.removeItem(REFRESH_KEY)
}

export function setLogoutHandler(fn: () => void): void {
  logoutHandler = () => {
    clearSession()
    fn()
  }
}

export function logout(): void {
  logoutHandler ? logoutHandler() : clearSession()
}

async function doRefresh(): Promise<string | null> {
  const refresh = getRefreshToken()
  if (!refresh) return null
  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    })
    if (!res.ok) {
      clearSession()
      return null
    }
    const body = (await res.json()) as { data?: TokenPair }
    if (!body.data) {
      clearSession()
      return null
    }
    setTokens(body.data)
    return body.data.access_token
  } catch {
    // A network blip must not wipe a working session: keep the refresh token so
    // the next request can try again.
    return null
  }
}

/** Exchanges the refresh token for a new pair; concurrent callers share one flight. */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null
    })
  }
  return refreshing
}
