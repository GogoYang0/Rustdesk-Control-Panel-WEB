import { describe, expect, it } from 'vitest'

import {
  DEFAULT_DEVICE_FILTERS,
  DEVICE_PAGE_SIZE,
  DEVICE_Q_MAX,
  parseDeviceFilters,
  toDeviceRequestQuery,
  toDeviceSearchParams,
} from './device-query'

describe('device filters in the URL', () => {
  it('returns the defaults for an empty query string', () => {
    expect(parseDeviceFilters(new URLSearchParams())).toEqual(DEFAULT_DEVICE_FILTERS)
  })

  it('keeps a fully specified filter set', () => {
    expect(parseDeviceFilters(new URLSearchParams('q=lab&bound=false&page=3'))).toEqual({
      q: 'lab',
      bound: 'false',
      page: 3,
    })
  })

  it('trims the keyword and treats whitespace as empty', () => {
    expect(parseDeviceFilters(new URLSearchParams('q=%20%20office%20%20')).q).toBe('office')
    expect(parseDeviceFilters(new URLSearchParams('q=%20%20%20')).q).toBe('')
  })

  it('caps an over-long keyword at the contract limit', () => {
    const long = 'a'.repeat(DEVICE_Q_MAX + 10)
    expect(parseDeviceFilters(new URLSearchParams(`q=${long}`)).q).toHaveLength(DEVICE_Q_MAX)
  })

  it.each([
    ['bound=yes', 'bound', ''],
    ['bound=1', 'bound', ''],
    ['page=0', 'page', 1],
    ['page=-3', 'page', 1],
    ['page=1.5', 'page', 1],
    ['page=1e21', 'page', 1],
  ] as const)('drops an invalid %s', (query, key, expected) => {
    expect(parseDeviceFilters(new URLSearchParams(query))[key]).toEqual(expected)
  })

  it('omits defaults from the URL', () => {
    expect(toDeviceSearchParams(DEFAULT_DEVICE_FILTERS).toString()).toBe('')
  })

  it('round-trips a non-default filter set', () => {
    const filters = parseDeviceFilters(new URLSearchParams('q=lab&bound=true&page=2'))
    expect(parseDeviceFilters(toDeviceSearchParams(filters))).toEqual(filters)
  })
})

describe('device request parameters', () => {
  it('maps filters onto the contract query names', () => {
    const query = toDeviceRequestQuery({ q: 'lab', bound: 'true', page: 2 })
    expect(query.get('q')).toBe('lab')
    expect(query.get('bound')).toBe('true')
    expect(query.get('page')).toBe('2')
    expect(query.get('pageSize')).toBe(String(DEVICE_PAGE_SIZE))
  })

  it('sends no empty filters but always pages', () => {
    const query = toDeviceRequestQuery(DEFAULT_DEVICE_FILTERS)
    expect(query.get('q')).toBeNull()
    expect(query.get('bound')).toBeNull()
    expect(query.get('page')).toBe('1')
    expect(query.get('pageSize')).toBe(String(DEVICE_PAGE_SIZE))
  })
})
