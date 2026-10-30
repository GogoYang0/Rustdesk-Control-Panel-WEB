import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import {
  MAX_RETENTION_DAYS,
  provisioningStateLabel,
  provisioningStateTone,
  readArchiveSummary,
  retentionDaysProblem,
  settingsError,
} from './settings'

function api(status: number) {
  return new ApiError(status, 'error', 'backend message')
}

describe('provisioning states', () => {
  it('labels and tones known states and keeps unknown values raw', () => {
    expect(provisioningStateLabel('disabled')).toBe('未启用')
    expect(provisioningStateLabel('pending')).toBe('等待部署')
    expect(provisioningStateLabel('provisioning')).toBe('部署中')
    expect(provisioningStateLabel('deployed')).toBe('已部署')
    expect(provisioningStateLabel('failed')).toBe('部署失败')
    expect(provisioningStateLabel('draining')).toBe('draining')
    expect(provisioningStateTone('deployed')).toBe('green')
    expect(provisioningStateTone('failed')).toBe('red')
    expect(provisioningStateTone('unknown')).toBe('grey')
  })
})

describe('audit retention validation', () => {
  it('accepts 0–3650 and rejects empty, decimals, negatives and overflow', () => {
    expect(MAX_RETENTION_DAYS).toBe(3650)
    expect(retentionDaysProblem('0')).toBeNull()
    expect(retentionDaysProblem(' 90 ')).toBeNull()
    expect(retentionDaysProblem('3650')).toBeNull()
    expect(retentionDaysProblem('')).toBe('请输入保留天数（0 表示永久）')
    expect(retentionDaysProblem('   ')).toBe('请输入保留天数（0 表示永久）')
    expect(retentionDaysProblem('1.5')).toBe('保留天数必须是整数')
    expect(retentionDaysProblem('-1')).toContain('0–3650')
    expect(retentionDaysProblem('3651')).toContain('0–3650')
  })
})

describe('archive summary', () => {
  it('distinguishes none, valid and malformed summaries', () => {
    expect(readArchiveSummary(null)).toEqual({ kind: 'none' })
    expect(readArchiveSummary(undefined)).toEqual({ kind: 'none' })
    expect(
      readArchiveSummary({ at: '2026-10-30T00:00:00Z', rows: 12, path: '/archive/1.gz' }),
    ).toEqual({
      kind: 'ok',
      at: '2026-10-30T00:00:00Z',
      rows: 12,
      path: '/archive/1.gz',
    })
    expect(readArchiveSummary({ at: 1, rows: '12', path: null })).toEqual({ kind: 'invalid' })
    expect(readArchiveSummary('oops')).toEqual({ kind: 'invalid' })
  })
})

describe('settings error copy', () => {
  it('keeps owner and validation messages precise', () => {
    expect(settingsError(api(403), 'provisioning')).toContain('owner')
    expect(settingsError(api(400), 'retention')).toContain('0–3650')
    expect(settingsError(api(404), 'providers')).toContain('组织不存在')
    expect(settingsError(api(500), 'provisioning')).toContain('暂时不可用')
    expect(settingsError(api(0), 'retention')).toContain('网络')
    expect(settingsError(new Error('boom'), 'providers')).toContain('网络')
  })
})
