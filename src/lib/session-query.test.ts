import { describe, expect, it } from 'vitest'

import {
  DEFAULT_FILTERS,
  PAGE_SIZE,
  parseFilters,
  rangeToSince,
  toRequestQuery,
  toSearchParams,
  totalPages,
} from './session-query'

const NOW = new Date('2026-10-28T12:00:00.000Z')

describe('session filters in the URL', () => {
  it('returns the defaults for an empty query string', () => {
    expect(parseFilters(new URLSearchParams())).toEqual(DEFAULT_FILTERS)
  })

  it('keeps a fully specified filter set', () => {
    const filters = parseFilters(
      new URLSearchParams('origin=native&status=denied&deviceId=42&range=30d&page=3'),
    )
    expect(filters).toEqual({
      origin: 'native',
      status: 'denied',
      deviceId: '42',
      range: '30d',
      page: 3,
    })
  })

  it.each([
    ['origin=console', 'origin', ''],
    ['status=bogus', 'status', ''],
    ['deviceId=0', 'deviceId', ''],
    ['deviceId=abc', 'deviceId', ''],
    ['range=90d', 'range', DEFAULT_FILTERS.range],
    ['page=0', 'page', 1],
    ['page=-2', 'page', 1],
    ['page=1.5', 'page', 1],
    ['page=1e21', 'page', 1],
    ['page=1000001', 'page', 1],
  ] as const)('drops an invalid %s', (query, key, expected) => {
    expect(parseFilters(new URLSearchParams(query))[key]).toEqual(expected)
  })

  it('omits defaults from the URL so the common view stays short', () => {
    expect(toSearchParams(DEFAULT_FILTERS).toString()).toBe('')
  })

  it('round-trips a non-default filter set', () => {
    const filters = parseFilters(new URLSearchParams('origin=panel&range=all&page=2'))
    expect(parseFilters(toSearchParams(filters))).toEqual(filters)
  })
})

describe('session request parameters', () => {
  it('turns the range into a since timestamp', () => {
    expect(rangeToSince('24h', NOW)).toBe('2026-10-27T12:00:00.000Z')
    expect(rangeToSince('7d', NOW)).toBe('2026-10-21T12:00:00.000Z')
    expect(rangeToSince('30d', NOW)).toBe('2026-09-28T12:00:00.000Z')
    expect(rangeToSince('all', NOW)).toBeUndefined()
  })

  it('maps filters onto the contract query names', () => {
    const query = toRequestQuery(
      { origin: 'panel', status: 'open', deviceId: '7', range: '7d', page: 2 },
      NOW,
    )
    expect(query.get('origin')).toBe('panel')
    expect(query.get('status')).toBe('open')
    expect(query.get('deviceId')).toBe('7')
    expect(query.get('since')).toBe('2026-10-21T12:00:00.000Z')
    expect(query.get('page')).toBe('2')
    expect(query.get('pageSize')).toBe(String(PAGE_SIZE))
  })

  it('sends no since for the all-time range and no empty filters', () => {
    const query = toRequestQuery({ ...DEFAULT_FILTERS, range: 'all' }, NOW)
    expect(query.get('since')).toBeNull()
    expect(query.get('origin')).toBeNull()
    expect(query.get('status')).toBeNull()
    expect(query.get('deviceId')).toBeNull()
  })

  it('counts whole pages, with at least one for an empty total', () => {
    expect(totalPages(0)).toBe(1)
    expect(totalPages(1)).toBe(1)
    expect(totalPages(PAGE_SIZE)).toBe(1)
    expect(totalPages(PAGE_SIZE + 1)).toBe(2)
  })
})
