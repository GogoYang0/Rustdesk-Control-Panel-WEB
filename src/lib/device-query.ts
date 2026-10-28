// Device list filters. Only what the contract supports: `q` (name or rustdesk
// id) and `bound`. Online/disabled have no query parameters, so filtering them
// in the browser would silently drop rows from the other pages.

export const DEVICE_PAGE_SIZE = 50
export const DEVICE_Q_MAX = 64

export type DeviceBound = '' | 'true' | 'false'

export interface DeviceFilters {
  q: string
  bound: DeviceBound
  page: number
}

export const DEFAULT_DEVICE_FILTERS: DeviceFilters = { q: '', bound: '', page: 1 }

function normaliseQ(value: string): string {
  // The contract caps `q` at 64 characters; trimming first keeps the cap from
  // turning a trailing-space search into a truncated one.
  return value.trim().slice(0, DEVICE_Q_MAX)
}

/** Unknown or malformed values fall back to the default instead of erroring. */
export function parseDeviceFilters(params: URLSearchParams): DeviceFilters {
  const bound = params.get('bound') ?? ''
  const page = Number(params.get('page') ?? '')
  return {
    q: normaliseQ(params.get('q') ?? ''),
    bound: bound === 'true' || bound === 'false' ? bound : '',
    page: Number.isSafeInteger(page) && page > 0 && page <= 1_000_000 ? page : 1,
  }
}

/** Omits defaults so the common view keeps a short, readable URL. */
export function toDeviceSearchParams(filters: DeviceFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.bound) params.set('bound', filters.bound)
  if (filters.page > 1) params.set('page', String(filters.page))
  return params
}

/** Request parameters for `GET /orgs/{orgId}/devices`. */
export function toDeviceRequestQuery(
  filters: DeviceFilters,
  pageSize = DEVICE_PAGE_SIZE,
): URLSearchParams {
  const query = new URLSearchParams()
  if (filters.q) query.set('q', filters.q)
  if (filters.bound) query.set('bound', filters.bound)
  query.set('page', String(filters.page))
  query.set('pageSize', String(pageSize))
  return query
}
