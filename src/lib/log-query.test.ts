import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import {
  DEFAULT_LOG_FILTERS,
  LOG_LIMITS,
  logDetailRaw,
  logDetailRest,
  logEventDeviceLabel,
  logKindLabel,
  logLevelLabel,
  logLevelTone,
  logListError,
  logRangeSince,
  logSourceLabel,
  logSummary,
  parseLogFilters,
  toLogRequestQuery,
  toLogSearchParams,
} from './log-query'

const now = new Date('2026-10-29T06:00:00.000Z')

describe('parseLogFilters', () => {
  it('defaults to 7d, 50 rows and no filters', () => {
    expect(parseLogFilters(new URLSearchParams())).toEqual(DEFAULT_LOG_FILTERS)
  })

  it('parses valid values and drops unknown ones', () => {
    const filters = parseLogFilters(
      new URLSearchParams('deviceId=12&level=warn&range=30d&limit=200'),
    )
    expect(filters).toEqual({ deviceId: 12, level: 'warn', range: '30d', limit: 200 })
  })

  it('falls back on zero, negative, float, unknown and out-of-set values', () => {
    expect(
      parseLogFilters(new URLSearchParams('deviceId=0&level=debug&range=90d&limit=500')),
    ).toEqual(DEFAULT_LOG_FILTERS)
    expect(parseLogFilters(new URLSearchParams('deviceId=1.5'))).toEqual(DEFAULT_LOG_FILTERS)
    expect(parseLogFilters(new URLSearchParams('deviceId=-3'))).toEqual(DEFAULT_LOG_FILTERS)
  })
})

describe('toLogSearchParams', () => {
  it('omits defaults and keeps only non-default filters', () => {
    expect(toLogSearchParams(DEFAULT_LOG_FILTERS).toString()).toBe('')
    const params = toLogSearchParams({ deviceId: 7, level: 'error', range: '24h', limit: 100 })
    expect(params.get('deviceId')).toBe('7')
    expect(params.get('level')).toBe('error')
    expect(params.get('range')).toBe('24h')
    expect(params.get('limit')).toBe('100')
  })
})

describe('logRangeSince', () => {
  it('subtracts the range from the frozen now and keeps exact milliseconds', () => {
    expect(logRangeSince('24h', now)).toBe('2026-10-28T06:00:00.000Z')
    expect(logRangeSince('7d', now)).toBe('2026-10-22T06:00:00.000Z')
    expect(logRangeSince('30d', now)).toBe('2026-09-29T06:00:00.000Z')
  })

  it('returns undefined for the all range', () => {
    expect(logRangeSince('all', now)).toBeUndefined()
  })
})

describe('toLogRequestQuery', () => {
  it('always sends the limit and includes only active filters', () => {
    const query = toLogRequestQuery(DEFAULT_LOG_FILTERS, now)
    expect(query.get('limit')).toBe('50')
    expect(query.get('deviceId')).toBeNull()
    expect(query.get('level')).toBeNull()
    expect(query.get('since')).toBe('2026-10-22T06:00:00.000Z')
  })

  it('sends device, level and since for a narrowed range', () => {
    const query = toLogRequestQuery({ deviceId: 9, level: 'warn', range: '30d', limit: 200 }, now)
    expect(query.get('deviceId')).toBe('9')
    expect(query.get('level')).toBe('warn')
    expect(query.get('limit')).toBe('200')
    expect(query.get('since')).toBe('2026-09-29T06:00:00.000Z')
  })

  it('omits since for the all range', () => {
    const query = toLogRequestQuery({ ...DEFAULT_LOG_FILTERS, range: 'all' }, now)
    expect(query.get('since')).toBeNull()
    expect(query.get('limit')).toBe('50')
  })
})

describe('labels', () => {
  it('labels known kinds and keeps unknown values verbatim', () => {
    expect(logKindLabel('conn')).toBe('连接')
    expect(logKindLabel('file')).toBe('文件传输')
    expect(logKindLabel('disconnected')).toBe('断开')
    expect(logKindLabel('error')).toBe('错误')
    expect(logKindLabel('other')).toBe('其他')
    expect(logKindLabel('something_new')).toBe('something_new')
  })

  it('maps levels to Chinese copy and tones', () => {
    expect(logLevelLabel('info')).toBe('提示')
    expect(logLevelLabel('warn')).toBe('警告')
    expect(logLevelLabel('error')).toBe('错误')
    expect(logLevelTone('info')).toBe('green')
    expect(logLevelTone('warn')).toBe('orange')
    expect(logLevelTone('error')).toBe('red')
  })

  it('labels hbbs and hbbr plus unknown sources', () => {
    expect(logSourceLabel('hbbs')).toBe('hbbs 信令')
    expect(logSourceLabel('hbbr')).toBe('hbbr 中继')
    expect(logSourceLabel('other')).toBe('other')
  })

  it('resolves a device name, an id fallback and an unlinked row', () => {
    const names = new Map([[3, '工作站 A']])
    expect(logEventDeviceLabel(3, names)).toBe('工作站 A')
    expect(logEventDeviceLabel(9, names)).toBe('设备 #9')
    expect(logEventDeviceLabel(null, names)).toBe('未关联设备')
    expect(logEventDeviceLabel(undefined, names)).toBe('未关联设备')
  })
})

describe('logSummary', () => {
  it('shows the first two non-devseed values', () => {
    expect(logSummary({ devseed: 'e2e', peer: '10.0.0.5', user: 'alice', raw: 'line' })).toBe(
      '10.0.0.5 · alice',
    )
  })

  it('renders primitives directly and abbreviates nested JSON', () => {
    expect(logSummary({ count: 2, ok: true, nested: { a: 1 } })).toBe('2 · true')
    expect(logSummary({ raw: 'x'.repeat(100) })).toBe(`${'x'.repeat(80)}…`)
  })

  it('returns a dash for missing or empty detail', () => {
    expect(logSummary(null)).toBe('—')
    expect(logSummary(undefined)).toBe('—')
    expect(logSummary({ devseed: 'e2e' })).toBe('—')
  })
})

describe('log detail parts', () => {
  it('separates the raw line from the remaining captured fields', () => {
    const detail = { raw: 'INFO line', peer: '10.0.0.5', seed: 'e2e' }
    expect(logDetailRaw(detail)).toBe('INFO line')
    expect(logDetailRest(detail)).toBe('{\n  "peer": "10.0.0.5",\n  "seed": "e2e"\n}')
  })

  it('has no raw or rest for a missing detail', () => {
    expect(logDetailRaw(null)).toBeNull()
    expect(logDetailRest(null)).toBeNull()
    expect(logDetailRest({ raw: 'only', devseed: 'e2e' })).toBeNull()
    expect(logDetailRest({ raw: 'only', seed: 'kept' })).toBe('{\n  "seed": "kept"\n}')
  })
})

describe('logListError', () => {
  it('maps API failures to Chinese copy without exposing backend messages', () => {
    expect(logListError(new ApiError(0, 'network', 'boom'))).toBe('网络异常，请稍后重试')
    expect(logListError(new ApiError(400, 'invalid_request', 'bad'))).toBe(
      '筛选参数不合法，请调整后重试',
    )
    expect(logListError(new ApiError(401, 'unauthorized', 'nope'))).toBe('登录已失效，请重新登录')
    expect(logListError(new ApiError(403, 'forbidden', 'nope'))).toBe('当前角色没有日志读取权限')
    expect(logListError(new ApiError(404, 'not_found', 'nope'))).toBe('组织不存在')
    expect(logListError(new ApiError(500, 'internal', 'sql'))).toBe('服务异常，请稍后重试')
    expect(logListError(new Error('other'))).toBe('网络异常，请稍后重试')
  })
})

describe('limits', () => {
  it('offers exactly the contract-friendly page sizes', () => {
    expect(LOG_LIMITS).toEqual([50, 100, 200])
  })
})
