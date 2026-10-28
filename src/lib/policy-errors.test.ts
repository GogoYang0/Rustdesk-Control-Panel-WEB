import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import { policyWriteError } from './policy-errors'

describe('policy write errors', () => {
  it('explains a duplicate name', () => {
    expect(policyWriteError(new ApiError(409, 'conflict', 'policy name already exists'))).toBe(
      '策略名称已存在，请换一个',
    )
  })

  it('explains permission failures', () => {
    expect(policyWriteError(new ApiError(403, 'forbidden', 'forbidden'))).toBe(
      '当前角色没有管理策略的权限',
    )
  })

  it('explains a missing policy', () => {
    expect(policyWriteError(new ApiError(404, 'not_found', 'policy not found'))).toBe(
      '策略不存在（可能已被删除）',
    )
  })

  it('localises the status-0 wrapper and other network failures', () => {
    expect(policyWriteError(new ApiError(0, 'internal', 'TypeError: Failed to fetch'))).toBe(
      '网络异常，请稍后重试',
    )
    expect(policyWriteError(new TypeError('Failed to fetch'))).toBe('网络异常，请稍后重试')
  })

  it('translates bad requests and server failures', () => {
    expect(policyWriteError(new ApiError(400, 'invalid_request', 'invalid window'))).toBe(
      '请求参数不合法，请检查填写内容',
    )
    expect(policyWriteError(new ApiError(500, 'internal', 'database is locked'))).toBe(
      '服务异常，请稍后重试',
    )
  })
})
