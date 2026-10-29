import { Banner, Empty } from '@douyinfe/semi-ui'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'

import SideSheet from '../../components/SideSheet'
import type { Alert } from '../../lib/api'
import {
  ALERT_KINDS,
  ALERT_PAGE_SIZE,
  DEFAULT_ALERT_FILTERS,
  alertKindLabel,
  alertSeverityLabel,
  alertSeverityTone,
  detailSummary,
  parseAlertFilters,
  toAlertRequestQuery,
  toAlertSearchParams,
  type AlertFilters,
  type AlertRange,
} from '../../lib/alert-query'
import { formatTime } from '../../lib/format'
import { totalPages } from '../../lib/paging'
import { useGetAlertPageQuery, useGetDevicesQuery, useGetMeQuery } from '../../store/api'

const SEVERITIES: { value: AlertFilters['severity']; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'critical', label: '严重' },
  { value: 'warning', label: '警告' },
  { value: 'info', label: '提示' },
]

const RANGES: { value: AlertRange; label: string }[] = [
  { value: '24h', label: '24 小时' },
  { value: '7d', label: '7 天' },
  { value: '30d', label: '30 天' },
  { value: 'all', label: '全部时间' },
]

export default function AlertsPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const scopeRef = useRef(id)
  const orgChanged = scopeRef.current !== id
  const filters = parseAlertFilters(searchParams)
  const effective: AlertFilters = orgChanged ? { ...DEFAULT_ALERT_FILTERS } : filters
  const { severity, kind, range, page } = effective

  // Freeze the cutoff per filter set: recomputing it per page would slide the
  // window and make pages incomparable.
  const [refreshNonce, setRefreshNonce] = useState(0)
  const cutoffKey = `${id}|${severity}|${kind}|${range}|${refreshNonce}`
  const rangeNow = useMemo(() => new Date(), [cutoffKey])
  const queryString = useMemo(
    () => toAlertRequestQuery({ severity, kind, range, page }, rangeNow).toString(),
    [severity, kind, range, page, rangeNow],
  )
  const {
    currentData: data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetAlertPageQuery({ orgId: id, queryString }, { skip: !id })
  const loadingCurrent = isLoading || (isFetching && data === undefined)
  const alerts = data?.items ?? []
  const total = data?.total ?? 0
  const pages = totalPages(total, data?.page_size ?? ALERT_PAGE_SIZE)

  const { data: me } = useGetMeQuery()
  const perms = useMemo(() => {
    const current = me?.orgs.find((org) => org.id === id)
    return new Set(current?.permissions ?? [])
  }, [me, id])
  const { currentData: devicesPage } = useGetDevicesQuery(id, {
    skip: !id || !perms.has('device.read'),
  })
  const devices = useMemo(() => {
    const map = new Map<number, { name: string; rustdeskId: string }>()
    for (const device of devicesPage?.items ?? []) {
      map.set(device.id, { name: device.name, rustdeskId: device.rustdesk_id })
    }
    return map
  }, [devicesPage])

  const [selected, setSelected] = useState<Alert | null>(null)

  useLayoutEffect(() => {
    if (scopeRef.current === id) return
    scopeRef.current = id
  }, [id])

  useEffect(() => {
    setSelected(null)
    if (orgChanged && searchParams.toString()) {
      setSearchParams(new URLSearchParams(), { replace: true })
    }
  }, [id, orgChanged, searchParams, setSearchParams])

  function change(patch: Partial<AlertFilters>) {
    const touchesFilters = ['severity', 'kind', 'range'].some((key) => key in patch)
    setSearchParams(
      toAlertSearchParams({
        ...filters,
        ...patch,
        page: patch.page ?? (touchesFilters ? 1 : filters.page),
      }),
      { replace: true },
    )
  }

  useEffect(() => {
    if (orgChanged) return
    if (data && page > pages) change({ page: pages })
  }, [orgChanged, data, page, pages])

  // The sheet shows a row snapshot; if a refresh drops that row, close it.
  useEffect(() => {
    if (!selected || !data) return
    if (!data.items.some((item) => item.id === selected.id)) setSelected(null)
  }, [data, selected])

  const pageCounts = useMemo(() => {
    const counts = { critical: 0, warning: 0, info: 0 }
    for (const item of alerts) counts[item.severity] += 1
    return counts
  }, [alerts])

  const extraKind = kind && !(ALERT_KINDS as readonly string[]).includes(kind) ? kind : ''

  return (
    <section className="page on">
      <div className="page-head">
        <div>
          <h1 className="page-title">告警中心</h1>
          <div className="page-sub">
            共 {total} 条 · 本页 严重 {pageCounts.critical} · 警告 {pageCounts.warning} · 提示{' '}
            {pageCounts.info}
          </div>
        </div>
        <div className="spacer" />
        <div className="head-actions">
          <button
            className="btn outline sm"
            type="button"
            disabled={isFetching}
            onClick={() => {
              setRefreshNonce((nonce) => nonce + 1)
              // `all` sends no since, so the query string is unchanged; only an
              // explicit refetch moves it forward.
              if (range === 'all') void refetch()
            }}
          >
            {isFetching ? '刷新中…' : '刷新'}
          </button>
        </div>
      </div>

      <div className="banner info mb-14">
        <div>
          <b>告警是只增的记录</b>：服务端没有处置、已读或指派状态，本页只做查看与追溯。
          策略违规在签发/兑换阶段被阻断或由后台任务记账；native 直连无法事前阻断，只记录告警。
          查看告警不会改变任何连接。
        </div>
      </div>

      <div className="toolbar">
        <div className="chips" role="group" aria-label="严重级" style={{ margin: 0 }}>
          {SEVERITIES.map((option) => (
            <button
              key={option.value || 'all'}
              type="button"
              className={`chip-btn ${severity === option.value ? 'on' : ''}`}
              aria-pressed={severity === option.value}
              onClick={() => change({ severity: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>

        <select
          className="select-native"
          aria-label="告警类型"
          value={kind}
          onChange={(event) => change({ kind: event.target.value })}
        >
          <option value="">全部类型</option>
          {ALERT_KINDS.map((value) => (
            <option key={value} value={value}>
              {alertKindLabel(value)}
            </option>
          ))}
          {extraKind ? <option value={extraKind}>{extraKind}</option> : null}
        </select>

        <div className="spacer" />

        <div className="chips" role="group" aria-label="时间范围" style={{ margin: 0 }}>
          {RANGES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`chip-btn ${range === option.value ? 'on' : ''}`}
              aria-pressed={range === option.value}
              onClick={() => change({ range: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div style={{ marginBottom: 14 }}>
          <Banner
            type="danger"
            closeIcon={null}
            description={`加载告警失败：${(error as { message?: string }).message ?? '未知错误'}${
              data ? '（显示上次结果）' : ''
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

      {error && !data ? null : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-body tight" style={{ overflowX: 'auto' }}>
            {loadingCurrent ? (
              <div className="help" role="status" style={{ padding: '14px 0' }}>
                正在加载告警…
              </div>
            ) : alerts.length === 0 ? (
              <Empty title="没有符合条件的告警" description="调整严重级、类型或时间范围后再试" />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 150 }}>时间</th>
                    <th style={{ width: 90 }}>严重级</th>
                    <th style={{ width: 130 }}>类型</th>
                    <th>设备</th>
                    <th style={{ width: 110 }}>关联会话</th>
                    <th>摘要</th>
                    <th style={{ width: 80 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert) => {
                    const device =
                      alert.device_id != null ? devices.get(alert.device_id) : undefined
                    return (
                      <tr key={alert.id}>
                        <td className="mono">{formatTime(alert.created_at)}</td>
                        <td>
                          <span className={`tag ${alertSeverityTone(alert.severity)}`}>
                            {alertSeverityLabel(alert.severity)}
                          </span>
                        </td>
                        <td>{alertKindLabel(alert.kind)}</td>
                        <td className="cell-wrap">
                          {alert.device_id == null
                            ? '—'
                            : (device?.name ?? `设备 #${alert.device_id}`)}
                        </td>
                        <td className="mono">
                          {alert.session_id != null ? (
                            <button
                              className="btn borderless sm"
                              type="button"
                              onClick={() =>
                                navigate(`/orgs/${id}/sessions?sessionId=${alert.session_id}`)
                              }
                            >
                              会话 #{alert.session_id}
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="cell-wrap">
                          <span className="help">{detailSummary(alert)}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn borderless sm"
                            type="button"
                            onClick={() => setSelected(alert)}
                          >
                            详情
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {total > 0 ? (
              <div className="pager" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                <span className="total">
                  共 {total} 条 · 第 {page} / {pages} 页
                </span>
                <button
                  className="pg"
                  type="button"
                  disabled={page <= 1}
                  aria-label="上一页"
                  onClick={() => change({ page: page - 1 })}
                >
                  ‹
                </button>
                <span className="pg on" aria-current="page">
                  {page}
                </span>
                <button
                  className="pg"
                  type="button"
                  disabled={page >= pages}
                  aria-label="下一页"
                  onClick={() => change({ page: page + 1 })}
                >
                  ›
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <p className="help" style={{ marginTop: 12 }}>
        面板不在信令链路上：告警只记录违规事实，不掐断连接。原生直连的告警来自日志推断，
        事前审批被阻断属于受控流程，不产生告警。
      </p>

      {selected && !orgChanged ? (
        <AlertSheet
          key={`${id}-${selected.id}`}
          alert={selected}
          device={selected.device_id != null ? devices.get(selected.device_id) : undefined}
          onClose={() => setSelected(null)}
          onOpenSession={
            selected.session_id != null
              ? () => navigate(`/orgs/${id}/sessions?sessionId=${selected.session_id}`)
              : undefined
          }
        />
      ) : null}
    </section>
  )
}

function AlertSheet({
  alert,
  device,
  onClose,
  onOpenSession,
}: {
  alert: Alert
  device?: { name: string; rustdeskId: string }
  onClose: () => void
  onOpenSession?: () => void
}) {
  const detailEntries = Object.entries(alert.detail ?? {})
  return (
    <SideSheet title={`告警 #${alert.id}`} onClose={onClose}>
      <dl className="desc">
        <dt>严重级</dt>
        <dd>
          <span className={`tag ${alertSeverityTone(alert.severity)}`}>
            {alertSeverityLabel(alert.severity)}
          </span>
        </dd>
        <dt>类型</dt>
        <dd className="cell-wrap">{alertKindLabel(alert.kind)}</dd>
        <dt>时间</dt>
        <dd className="mono">{formatTime(alert.created_at)}</dd>
        <dt>设备</dt>
        <dd className="cell-wrap">
          {alert.device_id == null ? '—' : (device?.name ?? `设备 #${alert.device_id}`)}
          {device ? <span className="mono help"> {device.rustdeskId}</span> : null}
        </dd>
        <dt>关联会话</dt>
        <dd className="mono">
          {alert.session_id != null ? `会话 #${alert.session_id}` : '无关联会话'}
        </dd>
        {detailEntries.length === 0 ? (
          <>
            <dt>详情</dt>
            <dd>—</dd>
          </>
        ) : (
          detailEntries.map(([key, value]) => (
            <div key={key} style={{ display: 'contents' }}>
              <dt className="cell-wrap">{key}</dt>
              <dd className="mono cell-wrap">{JSON.stringify(value)}</dd>
            </div>
          ))
        )}
      </dl>

      {onOpenSession ? (
        <div className="row-end">
          <button className="btn outline sm" type="button" onClick={onOpenSession}>
            查看关联会话
          </button>
        </div>
      ) : null}
    </SideSheet>
  )
}
