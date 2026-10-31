import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import { memberSecurityError } from './member-security'

function api(status: number) {
  return new ApiError(status, 'error', 'backend English')
}

describe('memberSecurityError', () => {
  it('explains lockout risks per action', () => {
    expect(memberSecurityError(api(409), 'passkey')).toContain('没有本地密码')
    expect(memberSecurityError(api(409), 'identity')).toContain('没有本地凭据')
    expect(memberSecurityError(api(409), 'totp')).toContain('状态已变化')
  })

  it('maps permissions, passkey deployment and transport failures', () => {
    expect(memberSecurityError(api(403), 'totp')).toContain('其他组织')
    expect(memberSecurityError(api(503), 'passkey')).toContain('未启用 Passkey')
    expect(memberSecurityError(api(503), 'identity')).toContain('服务暂时不可用')
    expect(memberSecurityError(new TypeError('offline'), 'totp')).toContain('网络')
    expect(memberSecurityError(api(500), 'totp')).not.toContain('backend English')
  })
})
