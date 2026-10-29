import { Banner, Empty } from '@douyinfe/semi-ui'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'

import StateBlock from '../../components/StateBlock'
import type { LogEvent } from '../../lib/api'
import { formatTime } from '../../lib/format'
import {
  DEFAULT_LOG_FILTERS,
  LOG_LEVELS,
  LOG_LIMITS,
  LOG_RANGES,
  logEventDeviceLabel,
  logKindLabel,
  logLevelLabel,
  logLevelTone,
  logListError,
  logRangeLabel,
  logSourceLabel,
  logSummary,
  parseLogFilters,
  toLogRequestQuery,
  toLogSearchParams,
  type LogFilters,
} from '../../lib/log-query'
import { useGetDevicesQuery, useGetLogEventsQuery, useGetMeQuery } from '../../store/api'
import LogDetailSheet from './LogDetailSheet'

export default function LogsPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const [searchParams, setSearchParams] = useSearchParams()

  const { data: me, isLoading: meLoading } = useGetMeQuery()
  const current = me?.orgs.find((org) => org.id === id)
  const perms = useMemo(() => new Set(current?.permissions ?? []), [current])
  const canRead = perms.has('audit.read')
  const canReadDevices = perms.has('device.read')

  const scopeRef = useRef(id)
  const orgChanged = scopeRef.current !== id
  const filters = parseLogFilters(searchParams)
  const base: LogFilters = orgChanged ? { ...DEFAULT_LOG_FILTERS } : filters
  // A user without device.read cannot see the selector, so a deep-linked
  // deviceId must not silently narrow the list behind an invisible filter.
  const effective: LogFilters = canReadDevices ? base : { ...base, deviceId: null }

  const [refreshNonce, setRefreshNonce] = useState(0)
  const [selected, setSelected] = useState<LogEvent | null>(null)
  const [lastGood, setLastGood] = useState<{ key: string; rows: LogEvent[] } | null>(null)
  const rangeKey = `${id}|${effective.range}|${refreshNonce}`
  const now = useMemo(() => new Date(), [rangeKey])
  const queryString = useMemo(() => toLogRequestQuery(effective, now).toString(), [effective, now])

  const validId = Number.isSafeInteger(id) && id > 0
  const {
    currentData: rows,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetLogEventsQuery({ orgId: id, queryString }, { skip: !validId || !canRead })
  const { currentData: devicesPage } = useGetDevicesQuery(id, {
    skip: !validId || !canRead || !canReadDevices,
  })

  const names = useMemo(() => {
    const map = new Map<number, string>()
    for (const device of devicesPage?.items ?? []) map.set(device.id, device.name)
    return map
  }, [devicesPage])

  useLayoutEffect(() => {
    if (scopeRef.current === id) return
    scopeRef.current = id
  }, [id])

  useEffect(() => {
    if (!orgChanged) return
    setSelected(null)
    if (searchParams.toString()) setSearchParams(new URLSearchParams(), { replace: true })
  }, [orgChanged, searchParams, setSearchParams])

  const filterKey = `${id}|${effective.deviceId ?? ''}|${effective.level ?? ''}|${effective.range}|${effective.limit}`
  useEffect(() => {
    if (rows) setLastGood({ key: filterKey, rows })
  }, [rows, filterKey])

  // Keep the previous window visible while a refresh is in flight (or after it
  // fails): RTK Query drops `currentData` as soon as the `since` argument moves.
  const cachedRows = lastGood?.key === filterKey ? lastGood.rows : undefined
  const events = rows ?? cachedRows ?? []
  const selectedRow = selected

  useEffect(() => {
    if (selected && rows && !rows.some((row) => row.id === selected.id)) setSelected(null)
  }, [rows, selected])

  function change(patch: Partial<LogFilters>) {
    setSelected(null)
    setSearchParams(toLogSearchParams({ ...effective, ...patch }), { replace: true })
  }

  function resetFilters() {
    setSelected(null)
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  function refresh() {
    setRefreshNonce((nonce) => nonce + 1)
    // The all range sends no since, so the request string cannot change on its
    // own; ask the cache directly instead of waiting for a new argument.
    if (effective.range === 'all') void refetch()
  }

  if (!validId) {
    return <StateBlock code="404" title="组织不存在" description="组织 id 不合法。" />
  }

  if (meLoading) {
    return (
      <section className="page on">
        <div className="card">
          <div className="card-body">
            <div className="help" role="status">
              正在加载权限…
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (!me || !current) {
    return (
      <StateBlock
        code="403"
        title="没有日志读取权限"
        description="无法确认当前组织与权限，请重新登录或联系管理员。"
      />
    )
  }

  if (!canRead) {
    return (
      <StateBlock
        code="403"
        title="没有日志读取权限"
        description="当前角色没有 audit.read；请联系管理员调整角色。"
      />
    )
  }

  const devices = devicesPage?.items ?? []
  const loadingCurrent = isLoading || (isFetching && rows === undefined && cachedRows === undefined)

  return (
    <section className="page on">
      <div className="page-head">
        <div>
          <h1 className="page-title">日志采集</h1>
          <div className="page-sub">hbbs / hbbr 采集事件（只读）；可见范围由角色审计范围决定</div>
        </div>
        <div className="spacer" />
        <div className="head-actions">
          <button className="btn outline sm" type="button" onClick={refresh}>
            刷新
          </button>
        </div>
      </div>

      <div className="mb-14">
        <Banner
          type="info"
          closeIcon={null}
          description="采集规则与采集状态由部署配置管理，面板不提供编辑。事件按 30 天窗口清理（清扫周期由部署配置，可关闭）；连接与文件审计见「审计与日志」。"
        />
      </div>

      <div className="toolbar">
        <div className="chips" role="group" aria-label="时间范围" style={{ margin: 0 }}>
          {LOG_RANGES.map((value) => (
            <button
              key={value}
              type="button"
              className={`chip-btn ${effective.range === value ? 'on' : ''}`}
              aria-pressed={effective.range === value}
              onClick={() => change({ range: value })}
            >
              {logRangeLabel(value)}
            </button>
          ))}
        </div>

        <div className="chips" role="group" aria-label="级别" style={{ margin: 0 }}>
          <button
            type="button"
            className={`chip-btn ${effective.level === null ? 'on' : ''}`}
            aria-pressed={effective.level === null}
            onClick={() => change({ level: null })}
          >
            全部级别
          </button>
          {LOG_LEVELS.map((value) => (
            <button
              key={value}
              type="button"
              className={`chip-btn ${effective.level === value ? 'on' : ''}`}
              aria-pressed={effective.level === value}
              onClick={() => change({ level: value })}
            >
              {logLevelLabel(value)}
            </button>
          ))}
        </div>

        {canReadDevices ? (
          <select
            className="select-native"
            aria-label="设备"
            value={effective.deviceId === null ? '' : String(effective.deviceId)}
            onChange={(event) =>
              change({ deviceId: event.target.value === '' ? null : Number(event.target.value) })
            }
          >
            <option value="">全部设备</option>
            {devices.map((device) => (
              <option key={device.id} value={String(device.id)}>
                {device.name}
                {device.disabled ? '（停用）' : ''}
              </option>
            ))}
            {effective.deviceId !== null &&
            !devices.some((device) => device.id === effective.deviceId) ? (
              <option value={String(effective.deviceId)}>
                设备 #{effective.deviceId}（不在列表）
              </option>
            ) : null}
          </select>
        ) : (
          <span className="help">仅显示设备 ID</span>
        )}

        <select
          className="select-native"
          aria-label="最近条数"
          value={String(effective.limit)}
          onChange={(event) => change({ limit: Number(event.target.value) as LogFilters['limit'] })}
        >
          {LOG_LIMITS.map((value) => (
            <option key={value} value={String(value)}>
              最近 {value} 条
            </option>
          ))}
        </select>

        <div className="spacer" />
        <button className="btn borderless sm" type="button" onClick={resetFilters}>
          重置筛选
        </button>
      </div>

      {error ? (
        <div style={{ marginBottom: 14 }}>
          <Banner
            type="danger"
            closeIcon={null}
            description={`加载日志失败：${logListError(error)}${
              events.length > 0 ? '（显示上次结果）' : ''
            }`}
          />
          <button
            className="btn outline sm"
            type="button"
            style={{ marginTop: 8 }}
            onClick={() => void refetch()}
          >
            重试
          </button>
        </div>
      ) : null}

      {error && events.length === 0 ? null : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-body tight" style={{ overflowX: 'auto' }}>
            {loadingCurrent ? (
              <div className="help" role="status" style={{ padding: '14px 0' }}>
                正在加载采集日志…
              </div>
            ) : events.length === 0 ? (
              <Empty
                title="没有符合条件的采集日志"
                description="调整设备、级别或时间范围后再试；若角色审计范围为「仅本人」，这里只显示本人设备的事件"
              />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 150 }}>时间</th>
                    <th style={{ width: 110 }}>来源</th>
                    <th style={{ width: 80 }}>级别</th>
                    <th style={{ width: 90 }}>类型</th>
                    <th style={{ width: 150 }}>设备</th>
                    <th>摘要</th>
                    <th style={{ width: 80 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((row) => (
                    <tr key={row.id}>
                      <td className="mono">{formatTime(row.occurred_at)}</td>
                      <td>
                        <span className={`tag ${row.source === 'hbbs' ? 'blue' : 'grey'}`}>
                          {logSourceLabel(row.source)}
                        </span>
                      </td>
                      <td>
                        <span className={`tag ${logLevelTone(row.level)}`}>
                          {logLevelLabel(row.level)}
                        </span>
                      </td>
                      <td>{logKindLabel(String(row.kind))}</td>
                      <td className="cell-wrap">{logEventDeviceLabel(row.device_id, names)}</td>
                      <td className="mono cell-wrap">{logSummary(row.detail)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn borderless sm"
                          type="button"
                          onClick={() => setSelected(row)}
                        >
                          详情
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <p className="help" style={{ marginTop: 12 }}>
        仅显示最近 {effective.limit} 条（上限 200），不分页。事件由部署侧采集，面板只能查看；
        device_id 为空表示未能关联到本组织设备。
        {canReadDevices
          ? ' 设备筛选最多加载前 200 台设备，其余设备仍以 ID 显示。'
          : ' 设备筛选需要 device.read，当前仅展示设备 ID。'}
      </p>

      {selectedRow ? (
        <LogDetailSheet
          key={`${id}-${selectedRow.id}`}
          row={selectedRow}
          names={names}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </section>
  )
}
