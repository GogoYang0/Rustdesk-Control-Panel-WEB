import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import { createOrgError, orgNameProblem } from './org-create'

describe('orgNameProblem', () => {
  it('trims and enforces the contract bounds by code point', () => {
    expect(orgNameProblem('  ')).toContain('请填写')
    expect(orgNameProblem('  Acme  ')).toBeNull()
    expect(orgNameProblem('维'.repeat(128))).toBeNull()
    expect(orgNameProblem('维'.repeat(129))).toContain('128')
  })
})

describe('createOrgError', () => {
  it('maps quota, validation and service failures', () => {
    expect(createOrgError(new ApiError(409, 'conflict', 'quota'))).toContain('上限')
    expect(createOrgError(new ApiError(400, 'invalid_request', 'bad'))).toContain('不合法')
    expect(createOrgError(new ApiError(503, 'internal', 'boom'))).toContain('服务异常')
    expect(createOrgError(new ApiError(418, 'teapot', 'english'))).not.toContain('english')
  })

  it('treats network failures as unknown outcomes', () => {
    expect(createOrgError(new TypeError('Failed to fetch'))).toContain('可能已创建')
    expect(createOrgError(new ApiError(0, 'internal', 'network'))).toContain('可能已创建')
  })
})
