import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import {
  AUDIT_PAGE_SIZE,
  DEFAULT_AUDIT_FILTERS,
  MAX_AUDIT_PAGE,
  auditActorLabel,
  auditDetailText,
  auditListError,
  auditRangeBounds,
  auditTargetLabel,
  connectionStatusLabel,
  fileDirectionLabel,
  parseAuditFilters,
  toAuditRequestQuery,
  toAuditSearchParams,
} from './audit-query'

const now = new Date('2026-10-29T06:00:00.000Z')

describe('parseAuditFilters', () => {
  it('defaults to the audit tab, 7d and page 1', () => {
    expect(parseAuditFilters(new URLSearchParams())).toEqual(DEFAULT_AUDIT_FILTERS)
  })

  it('falls back on an unknown tab or range but keeps valid filters', () => {
    const f = parseAuditFilters(
      new URLSearchParams(
        'tab=nope&range=99d&action=get&targetType=user&targetId=7&rustdeskId= 123 ',
      ),
    )
    expect(f.tab).toBe('audit')
    expect(f.range).toBe('7d')
    expect(f.action).toBe('get')
    expect(f.targetType).toBe('user')
    expect(f.targetId).toBe('7')
    expect(f.rustdeskId).toBe(' 123 ')
  })

  it('keeps typed spaces while parsing but trims them for the request', () => {
    const f = parseAuditFilters(new URLSearchParams('action=+GET+&targetType=+http+'))
    expect(f.action).toBe(' GET ')
    expect(f.targetType).toBe(' http ')

    const audit = toAuditRequestQuery(f, now)
    expect(audit.get('action')).toBe('GET')
    expect(audit.get('targetType')).toBe('http')

    const client = toAuditRequestQuery({ ...f, tab: 'connections', rustdeskId: ' 123 ' }, now)
    expect(client.get('rustdeskId')).toBe('123')
  })

  it('drops whitespace-only filters from the request', () => {
    const query = toAuditRequestQuery(
      { ...DEFAULT_AUDIT_FILTERS, action: '   ', targetType: ' ', targetId: ' ' },
      now,
    )
    expect(query.get('action')).toBeNull()
    expect(query.get('targetType')).toBeNull()
    expect(query.get('targetId')).toBeNull()
  })

  it('keeps system actor 0 and rejects negative or fractional ids', () => {
    expect(parseAuditFilters(new URLSearchParams('actorUserId=0')).actorUserId).toBe(0)
    expect(parseAuditFilters(new URLSearchParams('actorUserId=-1')).actorUserId).toBeNull()
    expect(parseAuditFilters(new URLSearchParams('actorUserId=1.5')).actorUserId).toBeNull()
  })

  it('caps the page and truncates strings to contract limits', () => {
    const f = parseAuditFilters(
      new URLSearchParams(
        `page=${MAX_AUDIT_PAGE + 10}&action=${'a'.repeat(200)}&targetType=${'t'.repeat(80)}&targetId=${'i'.repeat(80)}&rustdeskId=${'r'.repeat(80)}`,
      ),
    )
    expect(f.page).toBe(MAX_AUDIT_PAGE)
    expect(f.action).toHaveLength(128)
    expect(f.targetType).toHaveLength(64)
    expect(f.targetId).toHaveLength(64)
    expect(f.rustdeskId).toHaveLength(64)
  })
})

describe('toAuditSearchParams', () => {
  it('round-trips tab, range, system actor and page', () => {
    const params = toAuditSearchParams({
      ...DEFAULT_AUDIT_FILTERS,
      tab: 'connections',
      range: '30d',
      actorUserId: 0,
      action: 'GET /api/v1/me',
      page: 3,
    })
    expect(params.get('tab')).toBe('connections')
    expect(params.get('range')).toBe('30d')
    expect(params.get('actorUserId')).toBe('0')
    expect(params.get('action')).toBe('GET /api/v1/me')
    expect(params.get('page')).toBe('3')
    expect(parseAuditFilters(params)).toEqual({
      ...DEFAULT_AUDIT_FILTERS,
      tab: 'connections',
      range: '30d',
      actorUserId: 0,
      action: 'GET /api/v1/me',
      page: 3,
    })
  })

  it('omits defaults and blank values', () => {
    const params = toAuditSearchParams(DEFAULT_AUDIT_FILTERS)
    expect(params.toString()).toBe('')
  })
})

describe('auditRangeBounds', () => {
  it('returns a half-open-style window with the same frozen now', () => {
    expect(auditRangeBounds('24h', now)).toEqual({
      from: '2026-10-28T06:00:00.000Z',
      to: '2026-10-29T06:00:00.000Z',
    })
  })

  it('sends no bounds for all', () => {
    expect(auditRangeBounds('all', now)).toEqual({})
  })
})

describe('toAuditRequestQuery', () => {
  it('sends audit filters including actor 0 and pagination', () => {
    const query = toAuditRequestQuery(
      {
        ...DEFAULT_AUDIT_FILTERS,
        action: 'session.ticket.redeem',
        actorUserId: 0,
        targetType: 'user',
        targetId: '7',
      },
      now,
    )
    expect(query.get('action')).toBe('session.ticket.redeem')
    expect(query.get('actorUserId')).toBe('0')
    expect(query.get('targetType')).toBe('user')
    expect(query.get('targetId')).toBe('7')
    expect(query.get('from')).toBe('2026-10-22T06:00:00.000Z')
    expect(query.get('to')).toBe('2026-10-29T06:00:00.000Z')
    expect(query.get('page')).toBe('1')
    expect(query.get('pageSize')).toBe(String(AUDIT_PAGE_SIZE))
  })

  it('sends only rustdeskId and bounds for connection/file tabs', () => {
    const query = toAuditRequestQuery(
      {
        ...DEFAULT_AUDIT_FILTERS,
        tab: 'files',
        action: 'ignored',
        actorUserId: 3,
        targetType: 'ignored',
        targetId: 'ignored',
        rustdeskId: '123456789',
      },
      now,
    )
    expect(query.get('rustdeskId')).toBe('123456789')
    expect(query.get('action')).toBeNull()
    expect(query.get('actorUserId')).toBeNull()
    expect(query.get('targetType')).toBeNull()
    expect(query.get('targetId')).toBeNull()
    expect(query.get('from')).toBe('2026-10-22T06:00:00.000Z')
    expect(query.get('to')).toBe('2026-10-29T06:00:00.000Z')
  })

  it('omits bounds for all', () => {
    const query = toAuditRequestQuery({ ...DEFAULT_AUDIT_FILTERS, range: 'all' }, now)
    expect(query.get('from')).toBeNull()
    expect(query.get('to')).toBeNull()
  })
})

describe('labels and details', () => {
  it('labels actors, targets, status, direction', () => {
    const emails = new Map([[7, 'ops@acme.local']])
    expect(auditActorLabel(0, emails)).toBe('系统')
    expect(auditActorLabel(7, emails)).toBe('ops@acme.local')
    expect(auditActorLabel(8, emails)).toBe('用户 #8')
    expect(auditTargetLabel('user', '7')).toBe('user 7')
    expect(auditTargetLabel('http', '')).toBe('http')
    expect(connectionStatusLabel('open')).toBe('进行中')
    expect(connectionStatusLabel('closed')).toBe('已关闭')
    expect(fileDirectionLabel('send')).toBe('发送')
    expect(fileDirectionLabel('receive')).toBe('接收')
  })

  it('renders legacy string detail verbatim and objects as JSON', () => {
    expect(auditDetailText('raw detail')).toBe('raw detail')
    expect(auditDetailText({ status: 200 })).toBe('{\n  "status": 200\n}')
    expect(auditDetailText(null)).toBe('')
  })
})

describe('auditListError', () => {
  it('maps statuses to Chinese without backend English', () => {
    expect(auditListError(new ApiError(403, 'forbidden', 'forbidden'))).toContain('权限')
    expect(auditListError(new ApiError(400, 'invalid', 'bad'))).toContain('筛选')
    expect(auditListError(new ApiError(0, 'internal', 'network'))).toContain('网络')
    expect(auditListError(new ApiError(500, 'internal', 'boom'))).toContain('服务异常')
    expect(auditListError(new Error('boom'))).toContain('网络')
  })
})
