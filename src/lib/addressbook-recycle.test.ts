import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import { deletedByLabel, filterRecycle, recycleError, retentionText } from './addressbook-recycle'

const now = new Date('2026-10-31T00:00:00.000Z')

function item(overrides: Record<string, unknown> = {}) {
  return {
    peer_id: '1001',
    alias: '设计机',
    hostname: 'design-01',
    tags: ['lab'],
    deleted_at: '2026-10-30T00:00:00.000Z',
    deleted_by: 7,
    ...overrides,
  }
}

describe('retentionText', () => {
  it('counts the 30-day window from the deletion time', () => {
    expect(retentionText('2026-10-30T00:00:00.000Z', now)).toBe('剩 29 天')
    expect(retentionText('2026-10-01T00:00:00.000Z', now)).toBe('等待清扫')
  })

  it('treats a malformed timestamp as unknown', () => {
    expect(retentionText('nope', now)).toBe('—')
  })
})

describe('deletedByLabel', () => {
  it('maps the sweep sentinel and missing members', () => {
    const emails = new Map([[7, 'ops@acme.local']])
    expect(deletedByLabel(0, emails)).toBe('系统')
    expect(deletedByLabel(7, emails)).toBe('ops@acme.local')
    expect(deletedByLabel(9, emails)).toBe('用户 #9')
    expect(deletedByLabel(-1, emails)).toBe('系统')
  })
})

describe('filterRecycle', () => {
  it('matches peer id, alias, hostname and tags while keeping server order', () => {
    const rows = [
      item({ peer_id: '2002', alias: '财务机', hostname: 'finance-01', tags: ['finance'] }),
      item({ peer_id: '1001', alias: '设计机', tags: ['lab'] }),
    ]
    expect(filterRecycle(rows, 'finance').visible.map((row) => row.peer_id)).toEqual(['2002'])
    expect(filterRecycle(rows, '设计').visible.map((row) => row.peer_id)).toEqual(['1001'])
    expect(filterRecycle(rows, 'design').visible.map((row) => row.peer_id)).toEqual(['1001'])
    expect(filterRecycle(rows, 'lab').visible.map((row) => row.peer_id)).toEqual(['1001'])
    expect(filterRecycle(rows, '').visible.map((row) => row.peer_id)).toEqual(['2002', '1001'])
  })

  it('caps rendering without losing the match count', () => {
    const rows = Array.from({ length: 3 }, (_, index) => item({ peer_id: String(index + 1) }))
    const result = filterRecycle(rows, '', 2)
    expect(result.visible).toHaveLength(2)
    expect(result.matched).toBe(3)
    expect(result.truncated).toBe(true)
  })
})

describe('recycleError', () => {
  it('explains the capacity limit on restore', () => {
    expect(recycleError(new ApiError(400, 'invalid_request', 'full'), 'restore')).toContain('2000')
    expect(recycleError(new ApiError(400, 'invalid_request', 'bad'), 'purge')).not.toContain('2000')
  })

  it('maps permissions, missing rows and service failures', () => {
    expect(recycleError(new ApiError(403, 'forbidden', 'x'), 'restore')).toContain('恢复权限')
    expect(recycleError(new ApiError(403, 'forbidden', 'x'), 'list')).toContain('查看回收站')
    expect(recycleError(new ApiError(404, 'not_found', 'x'), 'list')).toContain('不存在')
    expect(recycleError(new ApiError(403, 'forbidden', 'x'), 'purge')).toContain('永久删除')
    expect(recycleError(new ApiError(404, 'not_found', 'x'), 'restore')).toContain('不在回收站')
    expect(recycleError(new ApiError(0, 'internal', 'x'), 'restore')).toContain('网络')
    expect(recycleError(new ApiError(503, 'internal', 'x'), 'purge')).toContain('服务异常')
  })

  it('does not surface the backend message', () => {
    const err = new ApiError(418, 'teapot', 'backend english')
    expect(recycleError(err, 'restore')).not.toContain('backend')
  })
})
