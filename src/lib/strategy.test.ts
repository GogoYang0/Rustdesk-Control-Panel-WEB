import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import {
  STRATEGY_OPTION_KEYS,
  STRATEGY_PRIORITY_COPY,
  buildStrategyRows,
  optionValueProblem,
  rowsToConfig,
  strategyAssignmentLabel,
  strategyDeleteWarning,
  strategyError,
  strategyKeyCount,
  strategyNameProblem,
  strategyOptionLabel,
} from './strategy'

describe('strategy option rows', () => {
  it('exposes exactly the 20 whitelist keys', () => {
    expect(STRATEGY_OPTION_KEYS).toHaveLength(20)
    expect(strategyOptionLabel('enable-audio')).toBe('启用声音')
    expect(strategyOptionLabel('disable-ab')).toBe('禁用地址簿')
    expect(strategyOptionLabel('api-server')).toBe('api-server')
  })

  it('models presence separately from value', () => {
    const rows = buildStrategyRows({
      'enable-audio': 'Y',
      'enable-clipboard': '',
    })
    const audio = rows.find((row) => row.key === 'enable-audio')!
    const clipboard = rows.find((row) => row.key === 'enable-clipboard')!
    expect(audio).toMatchObject({ checked: true, value: 'Y' })
    expect(clipboard).toMatchObject({ checked: true, value: '' })
    expect(rowsToConfig(rows)).toEqual({ 'enable-audio': 'Y', 'enable-clipboard': '' })
  })

  it('keeps unchecked keys out even when their draft value is non-empty', () => {
    const rows = buildStrategyRows({})
    const first = rows[0]
    expect(rowsToConfig([{ ...first, checked: false, value: 'Y' }])).toEqual({})
    expect(rowsToConfig([{ ...first, checked: true, value: '' }])).toEqual({
      [first.key]: '',
    })
  })

  it('counts configured keys only', () => {
    expect(strategyKeyCount({ 'enable-audio': 'Y', 'disable-ab': 'N' })).toBe(2)
    expect(strategyKeyCount(null)).toBe(0)
  })
})

describe('strategy validation and copy', () => {
  const strategies = [
    { id: 1, name: 'Default' },
    { id: 2, name: 'Ops' },
  ]

  it('validates names case-insensitively and allows the edited strategy', () => {
    expect(strategyNameProblem('  ops ', strategies)).not.toBeNull()
    expect(strategyNameProblem('  ops ', strategies, 2)).toBeNull()
    expect(strategyNameProblem('', strategies)).not.toBeNull()
    expect(strategyNameProblem('a\u0007', strategies)).not.toBeNull()
  })

  it('bounds option values but allows empty strings', () => {
    expect(optionValueProblem('')).toBeNull()
    expect(optionValueProblem('Y')).toBeNull()
    expect(optionValueProblem('x'.repeat(257))).not.toBeNull()
    expect(optionValueProblem('a\u0007')).not.toBeNull()
  })

  it('labels assignments and describes delete/precedence semantics', () => {
    expect(strategyAssignmentLabel(null, strategies)).toBe('未分配')
    expect(strategyAssignmentLabel(2, strategies)).toBe('Ops')
    expect(strategyAssignmentLabel(9, strategies)).toContain('不存在')
    expect(strategyDeleteWarning()).toContain('三层')
    expect(STRATEGY_PRIORITY_COPY).toContain('设备 > 设备组 > 成员')
    expect(STRATEGY_PRIORITY_COPY).toContain('停用策略')
  })

  it('maps strategy errors without backend English', () => {
    expect(strategyError(new ApiError(409, 'conflict', 'sql'), 'create')).toContain('名称已被使用')
    expect(strategyError(new ApiError(400, 'invalid', 'bad'), 'update')).toContain('白名单')
    expect(strategyError(new ApiError(403, 'forbidden', 'x'), 'assign-group')).toContain(
      'access.manage',
    )
    expect(strategyError(new ApiError(404, 'not_found', 'x'), 'delete')).toBe('策略不存在')
    expect(strategyError(new ApiError(500, 'internal', 'sql'), 'strategies')).not.toContain('sql')
  })
})
