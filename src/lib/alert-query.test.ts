import { describe, expect, it } from 'vitest'

import type { Alert } from '../api/generated'
import {
  ALERT_KINDS,
  ALERT_PAGE_SIZE,
  DEFAULT_ALERT_FILTERS,
  alertKindLabel,
  alertSeverityLabel,
  alertSeverityTone,
  detailSummary,
  parseAlertFilters,
  rangeToSince,
  toAlertRequestQuery,
  toAlertSearchParams,
} from './alert-query'

const NOW = new Date('2026-10-29T12:00:00.000Z')

function alert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 5,
    organization_id: 1,
    kind: 'duration_exceeded',
    severity: 'critical',
    created_at: '2026-10-29T11:00:00.000Z',
    ...overrides,
  }
}

describe('alert filters in the URL', () => {
  it('defaults to all severities over the last seven days', () => {
    expect(parseAlertFilters(new URLSearchParams())).toEqual(DEFAULT_ALERT_FILTERS)
  })

  it('keeps valid severity, known kind, range and page', () => {
    expect(
      parseAlertFilters(
        new URLSearchParams('severity=warning&kind=outside_window&range=30d&page=2'),
      ),
    ).toEqual({ severity: 'warning', kind: 'outside_window', range: '30d', page: 2 })
  })

  it('keeps an unknown kind as-is instead of silently widening the filter', () => {
    expect(parseAlertFilters(new URLSearchParams('kind=legacy_kind')).kind).toBe('legacy_kind')
  })

  it.each([
    ['severity=bogus', 'severity', ''],
    ['range=90d', 'range', '7d'],
    ['page=0', 'page', 1],
    ['page=1e21', 'page', 1],
  ] as const)('normalises an invalid %s', (query, key, expected) => {
    expect(parseAlertFilters(new URLSearchParams(query))[key]).toEqual(expected)
  })

  it('omits defaults from the URL', () => {
    expect(toAlertSearchParams(DEFAULT_ALERT_FILTERS).toString()).toBe('')
    expect(toAlertSearchParams({ ...DEFAULT_ALERT_FILTERS, page: 2 }).toString()).toBe('page=2')
  })

  it('round-trips a non-default filter set, including an unknown kind', () => {
    const filters = parseAlertFilters(
      new URLSearchParams('severity=info&kind=legacy_kind&range=all&page=3'),
    )
    expect(parseAlertFilters(toAlertSearchParams(filters))).toEqual(filters)
  })
})

describe('alert filters round-trip', () => {
  it('keeps a severity-only filter through the URL', () => {
    const filters = parseAlertFilters(new URLSearchParams('severity=critical'))
    expect(parseAlertFilters(toAlertSearchParams(filters))).toEqual(filters)
  })

  it('returns the raw kind when no label exists', () => {
    expect(alertKindLabel('mystery_kind')).toBe('mystery_kind')
  })
})

describe('alert request parameters', () => {
  it('maps filters onto the contract query and ignores unknown fields', () => {
    const query = toAlertRequestQuery(
      { severity: 'critical', kind: 'duration_exceeded', range: '24h', page: 2 },
      NOW,
    )
    expect(query.get('severity')).toBe('critical')
    expect(query.get('kind')).toBe('duration_exceeded')
    expect(query.get('since')).toBe('2026-10-28T12:00:00.000Z')
    expect(query.get('page')).toBe('2')
    expect(query.get('pageSize')).toBe(String(ALERT_PAGE_SIZE))
  })

  it('sends no since for the all-time range and no empty filters', () => {
    const query = toAlertRequestQuery({ ...DEFAULT_ALERT_FILTERS, range: 'all' }, NOW)
    expect(query.get('since')).toBeNull()
    expect(query.get('severity')).toBeNull()
    expect(query.get('kind')).toBeNull()
  })

  it('truncates an over-long kind at the contract limit', () => {
    const long = 'k'.repeat(80)
    expect(parseAlertFilters(new URLSearchParams(`kind=${long}`)).kind).toHaveLength(64)
  })

  it('sends a kind filter without touching the other fields', () => {
    const query = toAlertRequestQuery(
      { severity: '', kind: 'legacy_kind', range: 'all', page: 1 },
      NOW,
    )
    expect(query.get('kind')).toBe('legacy_kind')
    expect(query.get('severity')).toBeNull()
    expect(query.get('since')).toBeNull()
  })

  it('accepts the largest page the API allows', () => {
    expect(parseAlertFilters(new URLSearchParams('page=100000')).page).toBe(100000)
    expect(parseAlertFilters(new URLSearchParams('page=100001')).page).toBe(1)
  })

  it('converts each range against the provided clock', () => {
    expect(rangeToSince('24h', NOW)).toBe('2026-10-28T12:00:00.000Z')
    expect(rangeToSince('7d', NOW)).toBe('2026-10-22T12:00:00.000Z')
    expect(rangeToSince('30d', NOW)).toBe('2026-09-29T12:00:00.000Z')
    expect(rangeToSince('all', NOW)).toBeUndefined()
  })
})

describe('labels and summaries', () => {
  it('labels severities and known kinds, falling back to the raw kind', () => {
    expect(alertSeverityLabel('critical')).toBe('严重')
    expect(alertSeverityLabel('warning')).toBe('警告')
    expect(alertSeverityLabel('info')).toBe('提示')
    expect(alertKindLabel('duration_exceeded')).toBe('会话时长超限')
    expect(alertKindLabel('concurrency_exceeded')).toBe('并发会话超限')
    expect(alertKindLabel('outside_window')).toBe('时段外发起')
    expect(alertKindLabel('legacy_kind')).toBe('legacy_kind')
    expect(ALERT_KINDS).toHaveLength(3)
  })

  it('maps severities onto the tag palette', () => {
    expect(alertSeverityTone('critical')).toBe('red')
    expect(alertSeverityTone('warning')).toBe('orange')
    expect(alertSeverityTone('info')).toBe('grey')
  })

  it('summarises the detail without inventing fields', () => {
    expect(detailSummary(alert({ detail: { limit: 30, open: 31 } }))).toBe('limit 30 · open 31')
    expect(detailSummary(alert({ detail: { limit: 30, reason: 'policy' } }))).toBe(
      'limit 30 · reason policy',
    )
    expect(detailSummary(alert({ detail: null }))).toBe('—')
    expect(detailSummary(alert({ detail: {} }))).toBe('—')
    expect(detailSummary(alert())).toBe('—')
    expect(detailSummary(alert({ detail: { limit: 30, open: 31, extra: true } }))).toBe(
      'limit 30 · open 31',
    )
    expect(detailSummary(alert({ detail: { window: { start: 60, end: 600 }, limit: null } }))).toBe(
      'window {"start":60,"end":600} · limit —',
    )
  })
})
