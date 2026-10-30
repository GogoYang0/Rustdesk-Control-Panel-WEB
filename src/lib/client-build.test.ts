import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import {
  appNameProblem,
  base64FromDataUrl,
  buildStatusLabel,
  buildStatusTone,
  capabilityBlockReason,
  clientBuildError,
  formatBytes,
  buildArtifactLabel,
  buildPlatformsLabel,
  canCancelBuild,
  DEFAULT_BUILD_FILTERS,
  isActiveBuildStatus,
  parseBuildFilters,
  toBuildRequestQuery,
  toBuildSearchParams,
  logoUploadProblem,
  platformLabel,
  profileNameProblem,
  provisioningLabel,
  shortSha,
} from './client-build'

const caps = {
  enabled: true,
  provisioning_state: 'deployed',
  defaults: {
    server: 'relay.example.com:21117',
    server_key: 'key',
    api_server: 'https://panel.example.com',
  },
}

describe('profileNameProblem', () => {
  it('requires 1–64 runes after trimming', () => {
    expect(profileNameProblem('  Acme  ', [])).toBeNull()
    expect(profileNameProblem('   ', [])).not.toBeNull()
    expect(profileNameProblem('x'.repeat(65), [])).not.toBeNull()
  })

  it('rejects control characters', () => {
    expect(profileNameProblem('a\u0007b', [])).not.toBeNull()
  })

  it('rejects a case-insensitive duplicate except the edited profile', () => {
    const profiles = [{ id: 1, name: 'Acme' }]
    expect(profileNameProblem('acme', profiles)).not.toBeNull()
    expect(profileNameProblem('ACME', profiles, 1)).toBeNull()
    expect(profileNameProblem('Beta', profiles)).toBeNull()
  })
})

describe('appNameProblem', () => {
  it('accepts Unicode letters/digits and the allowed punctuation', () => {
    expect(appNameProblem('Acme Remote 1.0_测试')).toBeNull()
    expect(profileNameProblem('🚀'.repeat(64), [])).toBeNull()
  })

  it('rejects empty, overlong, reserved and path-like names', () => {
    expect(appNameProblem('')).not.toBeNull()
    expect(appNameProblem('x'.repeat(33))).not.toBeNull()
    expect(appNameProblem('RustDesk')).not.toBeNull()
    expect(appNameProblem('.')).not.toBeNull()
    expect(appNameProblem('..')).not.toBeNull()
  })

  it('rejects characters the build template cannot embed', () => {
    expect(appNameProblem('Acme/Remote')).not.toBeNull()
    expect(appNameProblem('Acme "Remote"')).not.toBeNull()
    expect(appNameProblem('Acme 😀')).not.toBeNull()
    expect(appNameProblem('Acme ²')).not.toBeNull()
  })
})

describe('capabilityBlockReason', () => {
  it('blocks when the build capability is disabled', () => {
    expect(capabilityBlockReason({ ...caps, enabled: false })).toContain('未启用')
  })

  it('blocks every non-deployed provisioning state', () => {
    for (const state of ['provisioning', 'failed', 'disabled', 'missing']) {
      expect(capabilityBlockReason({ ...caps, provisioning_state: state })).not.toBeNull()
    }
  })

  it('blocks when deployed but defaults are missing', () => {
    expect(capabilityBlockReason({ ...caps, defaults: null })).not.toBeNull()
  })

  it('allows a deployed organization with defaults', () => {
    expect(capabilityBlockReason(caps)).toBeNull()
  })
})

describe('labels', () => {
  it('labels every build status and keeps unknown values', () => {
    expect(buildStatusLabel('pending')).toBe('排队中')
    expect(buildStatusLabel('ingesting')).toBe('回收产物')
    expect(buildStatusLabel('succeeded')).toBe('成功')
    expect(buildStatusLabel('mystery')).toBe('mystery')
    expect(buildStatusTone('failed')).toBe('red')
    expect(buildStatusTone('running')).toBe('blue')
    expect(buildStatusTone('succeeded')).toBe('green')
  })

  it('has a label and tone for every build status', () => {
    for (const status of [
      'pending',
      'dispatching',
      'dispatched',
      'running',
      'ingesting',
      'succeeded',
      'failed',
      'cancelled',
    ]) {
      expect(buildStatusLabel(status)).not.toBe(status)
      expect(buildStatusTone(status)).toMatch(/^(grey|blue|orange|green|red)$/)
    }
  })

  it('classifies active versus terminal statuses', () => {
    expect(isActiveBuildStatus('pending')).toBe(true)
    expect(isActiveBuildStatus('ingesting')).toBe(true)
    expect(isActiveBuildStatus('failed')).toBe(false)
    expect(isActiveBuildStatus('cancelled')).toBe(false)
  })

  it('labels platforms and provisioning states', () => {
    expect(platformLabel('windows-x64')).toBe('Windows x64')
    expect(platformLabel('android-arm64')).toBe('Android arm64')
    expect(platformLabel('custom')).toBe('custom')
    expect(provisioningLabel('deployed')).toBe('已部署')
    expect(provisioningLabel('provisioning')).toBe('供应中')
    expect(provisioningLabel('other')).toBe('other')
  })
})

describe('formatBytes and shortSha', () => {
  it('formats bytes with one decimal above 1 KiB', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KiB')
    expect(formatBytes(1536)).toBe('1.5 KiB')
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MiB')
  })

  it('shortens a sha256 hash without touching short text', () => {
    expect(shortSha('a'.repeat(64))).toBe(`${'a'.repeat(12)}…`)
    expect(shortSha('abc')).toBe('abc')
  })
})

describe('logoUploadProblem', () => {
  it('accepts a PNG up to 1 MiB', () => {
    expect(logoUploadProblem({ type: 'image/png', size: 1024 })).toBeNull()
    expect(logoUploadProblem({ type: '', size: 1024, name: 'logo.png' })).toBeNull()
  })

  it('rejects other types and oversized files', () => {
    expect(logoUploadProblem({ type: 'image/jpeg', size: 1024, name: 'logo.jpg' })).not.toBeNull()
    expect(logoUploadProblem({ type: 'image/png', size: 1024 * 1024 + 1 })).not.toBeNull()
  })

  it('strips the data URL prefix before sending base64', () => {
    expect(base64FromDataUrl('data:image/png;base64,QUJD')).toBe('QUJD')
    expect(base64FromDataUrl('QUJD')).toBe('')
  })
})

describe('clientBuildError', () => {
  it('maps statuses to Chinese copy by operation', () => {
    expect(clientBuildError(new ApiError(0, 'network', 'x'), 'profiles')).toBe(
      '网络异常，请稍后重试',
    )
    expect(clientBuildError(new ApiError(403, 'forbidden', 'x'), 'profiles')).toContain(
      '没有客户端生成器权限',
    )
    expect(clientBuildError(new ApiError(503, 'internal', 'x'), 'capabilities')).toContain(
      '构建能力不可用',
    )
    expect(clientBuildError(new ApiError(409, 'conflict', 'x'), 'profile-create')).toContain(
      '名称已被使用或 Profile 数量已达上限',
    )
    expect(clientBuildError(new ApiError(409, 'conflict', 'x'), 'profile-update')).toContain(
      '名称已被使用',
    )
    expect(clientBuildError(new ApiError(409, 'conflict', 'x'), 'profile-delete')).toContain(
      '进行中的构建',
    )
    expect(clientBuildError(new ApiError(400, 'invalid_request', 'x'), 'logo')).toContain(
      '256–1024',
    )
    expect(clientBuildError(new ApiError(409, 'conflict', 'x'), 'build-create')).toContain(
      '服务器未就绪或配额已满',
    )
    expect(clientBuildError(new ApiError(409, 'conflict', 'x'), 'build-cancel')).toContain(
      '状态已变化',
    )
    expect(clientBuildError(new ApiError(404, 'not_found', 'x'), 'artifact')).toBe('产物已不可下载')
  })

  it('never exposes the backend message', () => {
    const message = clientBuildError(
      new ApiError(500, 'internal', 'sql: database is locked'),
      'profiles',
    )
    expect(message).not.toContain('sql')
    expect(clientBuildError(new Error('boom'), 'profiles')).toBe('网络异常，请稍后重试')
  })
})

describe('build filters', () => {
  it('defaults to no filters, page 1 and 20 rows', () => {
    expect(parseBuildFilters(new URLSearchParams())).toEqual(DEFAULT_BUILD_FILTERS)
  })

  it('keeps known status/profile/page values and drops invalid ones', () => {
    expect(
      parseBuildFilters(new URLSearchParams('status=running&profileId=7&page=3&pageSize=100')),
    ).toEqual({ status: 'running', profileId: 7, page: 3, pageSize: 100 })
    expect(
      parseBuildFilters(new URLSearchParams('status=nope&profileId=0&page=0&pageSize=999')),
    ).toEqual(DEFAULT_BUILD_FILTERS)
    expect(parseBuildFilters(new URLSearchParams('page=999999')).page).toBe(100000)
  })

  it('omits defaults in the URL but always sends them to the API', () => {
    expect(toBuildSearchParams(DEFAULT_BUILD_FILTERS).toString()).toBe('')
    const filters = { status: 'failed', profileId: 2, page: 2, pageSize: 50 as const }
    const search = toBuildSearchParams(filters)
    expect(search.get('status')).toBe('failed')
    expect(search.get('profileId')).toBe('2')
    expect(search.get('page')).toBe('2')
    expect(search.get('pageSize')).toBe('50')

    const query = toBuildRequestQuery(DEFAULT_BUILD_FILTERS)
    expect(query.get('page')).toBe('1')
    expect(query.get('pageSize')).toBe('20')
    expect(query.get('status')).toBeNull()
  })
})

describe('build status actions', () => {
  it('allows cancelling only pre-ingest active states', () => {
    expect(canCancelBuild('pending')).toBe(true)
    expect(canCancelBuild('running')).toBe(true)
    expect(canCancelBuild('ingesting')).toBe(false)
    expect(canCancelBuild('succeeded')).toBe(false)
  })

  it('labels artifact counts and purged builds', () => {
    expect(buildArtifactLabel(0, false)).toBe('—')
    expect(buildArtifactLabel(2, false)).toBe('2')
    expect(buildArtifactLabel(2, true)).toBe('已清理')
  })

  it('joins known and unknown platform labels', () => {
    expect(buildPlatformsLabel(['windows-x64', 'custom'])).toBe('Windows x64, custom')
    expect(buildPlatformsLabel([])).toBe('—')
  })
})
